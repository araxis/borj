import math
import os
from collections import deque
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(os.environ.get("ZABUL_HORSE_SOURCE_GLB", r"C:\Users\meisa\Downloads\horse3.glb"))
OUT = ROOT / "public" / "assets" / "animals" / "ZabulWarHorse.glb"
TARGET_FACES = int(os.environ.get("ZABUL_HORSE_TARGET_FACES", "110000"))


def clear_scene():
    if bpy.ops.object.mode_set.poll():
        try:
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception:
            pass
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for blocks in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.actions, bpy.data.armatures):
        for item in list(blocks):
            if getattr(item, "users", 0) == 0:
                blocks.remove(item)


def mesh_bounds(obj):
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    mn = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    mx = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return mn, mx


def mesh_face_count(obj):
    return len(obj.data.polygons)


def select_source_mesh():
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise RuntimeError("Source GLB did not contain a mesh")

    kept = max(meshes, key=mesh_face_count)
    removed = []
    for obj in meshes:
        if obj == kept:
            continue
        removed.append({"name": obj.name, "faces": mesh_face_count(obj)})
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    return kept, removed


def decimate_for_runtime(obj):
    before = mesh_face_count(obj)
    if before <= TARGET_FACES:
        return {"before": before, "after": before, "ratio": 1.0}

    ratio = max(0.04, min(1.0, TARGET_FACES / before))
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new("runtime_face_budget", "DECIMATE")
    mod.ratio = ratio
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.update()
    return {"before": before, "after": mesh_face_count(obj), "ratio": ratio}


def normalize_source_mesh(obj):
    obj.name = "ZabulWarHorseMesh"
    obj.data.name = "ZabulWarHorseMeshData"
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.select_set(False)

    verts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    ymin = min(v.y for v in verts)
    ymax = max(v.y for v in verts)
    span = ymax - ymin
    low = [v for v in verts if v.y < ymin + span * 0.18]
    high = [v for v in verts if v.y > ymax - span * 0.18]
    low_avg_z = sum(v.z for v in low) / max(1, len(low))
    high_avg_z = sum(v.z for v in high) / max(1, len(high))
    # Game convention: horse head points authoring-space -Y, which exports to runtime +Z.
    if high_avg_z > low_avg_z:
        obj.data.transform(Matrix.Rotation(math.pi, 4, "Z"))
        obj.data.update()

    mn, mx = mesh_bounds(obj)
    center = (mn + mx) * 0.5
    obj.data.transform(Matrix.Translation(Vector((-center.x, -center.y, -mn.z))))
    obj.data.update()

    for mat in obj.data.materials:
        if mat:
            mat.name = "zabul_warhorse_source_mat"
    return obj


def create_armature():
    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    arm = bpy.context.object
    arm.name = "ZabulWarHorseRig"
    arm.data.name = "ZabulWarHorseArmature"
    arm.show_in_front = False
    arm.data.display_type = "STICK"
    bones = arm.data.edit_bones
    for bone in list(bones):
        bones.remove(bone)

    made = {}

    def add(name, head, tail, parent=None, connected=False):
        bone = bones.new(name)
        bone.head = head
        bone.tail = tail
        bone.roll = 0
        if parent:
            bone.parent = made[parent]
            bone.use_connect = connected
        made[name] = bone
        return bone

    add("root", (0, 0.0, 0.18), (0, 0.0, 0.58))
    add("spine", (0, 0.55, 1.02), (0, -0.40, 1.10), "root")
    add("chest", (0, -0.42, 1.08), (0, -0.68, 1.14), "spine")
    add("neck", (0, -0.62, 1.12), (0, -0.82, 1.34), "chest")
    add("head", (0, -0.82, 1.34), (0, -1.05, 1.22), "neck")
    add("tail_1", (0, 0.78, 0.95), (0, 1.00, 0.72), "spine")
    add("tail_2", (0, 1.00, 0.72), (0, 1.12, 0.50), "tail_1")
    add("saddle", (0, 0.08, 1.04), (0, 0.02, 1.24), "spine")
    add("rider_spine", (0, 0.02, 1.10), (0, -0.02, 1.55), "saddle")
    add("rider_head", (0, -0.02, 1.55), (0, -0.05, 1.82), "rider_spine")
    add("rider_lance", (-0.16, -0.08, 1.20), (-0.28, -0.28, 1.96), "rider_spine")

    for side, x in (("L", -0.18), ("R", 0.18)):
        for pair, y in (("front", -0.27), ("rear", 0.48)):
            add(f"{pair}_{side}_upper", (x, y, 0.88), (x, y, 0.48), "root")
            add(f"{pair}_{side}_lower", (x, y, 0.48), (x, y, 0.16), f"{pair}_{side}_upper", True)
            add(f"{pair}_{side}_hoof", (x, y, 0.16), (x, y - 0.03, 0.04), f"{pair}_{side}_lower", True)

    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def add_groups(obj, arm):
    groups = {bone.name: obj.vertex_groups.new(name=bone.name) for bone in arm.data.bones}
    verts = [v.co.copy() for v in obj.data.vertices]

    def add_weight(idx, entries):
        total = sum(w for _, w in entries if w > 0)
        if total <= 0:
            return
        for name, weight in entries:
            if weight > 0 and name in groups:
                groups[name].add([idx], weight / total, "ADD")

    for v in obj.data.vertices:
        co = verts[v.index]
        x, y, z = co.x, co.y, co.z
        side = "L" if x < 0 else "R"
        absx = abs(x)

        if z > 1.55:
            if absx > 0.18 or y < -0.22:
                add_weight(v.index, [("rider_lance", 0.78), ("rider_spine", 0.22)])
            else:
                add_weight(v.index, [("rider_head", 0.82), ("rider_spine", 0.18)])
            continue
        if z > 1.10 and x < -0.055 and y < -0.18:
            add_weight(v.index, [("rider_lance", 0.88), ("rider_spine", 0.12)])
            continue
        if z > 1.05 and absx < 0.58 and -0.52 < y < 0.45:
            add_weight(v.index, [("rider_spine", 0.85), ("saddle", 0.15)])
            continue

        front_absx_min = 0.035 if z < 0.44 else 0.085
        rear_absx_min = 0.055 if z < 0.44 else 0.10
        is_front_leg = -0.50 < y < -0.08 and z < 0.82 and absx > front_absx_min
        is_rear_leg = 0.20 < y < 0.84 and z < 0.78 and absx > rear_absx_min
        if is_front_leg or is_rear_leg:
            pair = "front" if is_front_leg else "rear"
            if z < 0.20:
                add_weight(v.index, [(f"{pair}_{side}_hoof", 0.85), (f"{pair}_{side}_lower", 0.15)])
            elif z < 0.46:
                t = (z - 0.20) / 0.26
                add_weight(v.index, [(f"{pair}_{side}_lower", 0.8 - 0.2 * t), (f"{pair}_{side}_upper", 0.2 + 0.2 * t)])
            else:
                add_weight(v.index, [(f"{pair}_{side}_upper", 0.85), ("spine", 0.15)])
            continue

        if y < -0.82 and z > 0.70:
            add_weight(v.index, [("head", 0.9), ("neck", 0.1)])
        elif y < -0.55 and z > 0.72:
            add_weight(v.index, [("neck", 0.75), ("chest", 0.25)])
        elif y > 0.78 and 0.30 < z < 1.05:
            add_weight(v.index, [("tail_1", 0.65), ("tail_2", 0.35)])
        elif y < -0.35:
            add_weight(v.index, [("chest", 0.75), ("spine", 0.25)])
        else:
            add_weight(v.index, [("spine", 1.0)])

    island_cleanup = rigidify_small_islands(obj, groups)
    mod = obj.modifiers.new("ZabulWarHorseArmature", "ARMATURE")
    mod.object = arm
    obj.parent = arm
    return island_cleanup


def rigidify_small_islands(obj, groups, max_vertices=380):
    edges = [[] for _ in obj.data.vertices]
    for edge in obj.data.edges:
        a, b = edge.vertices
        edges[a].append(b)
        edges[b].append(a)

    group_names = {group.index: group.name for group in obj.vertex_groups}
    visited = [False] * len(obj.data.vertices)
    cleaned = 0
    pinned_by_group = {}

    for start in range(len(obj.data.vertices)):
        if visited[start]:
            continue
        queue = deque([start])
        visited[start] = True
        ids = []
        while queue:
            idx = queue.popleft()
            ids.append(idx)
            for neighbor in edges[idx]:
                if not visited[neighbor]:
                    visited[neighbor] = True
                    queue.append(neighbor)

        if len(ids) > max_vertices:
            continue

        totals = {}
        for idx in ids:
            for assignment in obj.data.vertices[idx].groups:
                name = group_names.get(assignment.group)
                if name:
                    totals[name] = totals.get(name, 0.0) + assignment.weight
        if not totals:
            continue

        dominant = lance_like_island_pin(obj, ids) or leg_like_island_pin(obj, ids) or max(totals.items(), key=lambda item: item[1])[0]
        for group in obj.vertex_groups:
            try:
                group.remove(ids)
            except RuntimeError:
                pass
        groups[dominant].add(ids, 1.0, "REPLACE")
        cleaned += 1
        pinned_by_group[dominant] = pinned_by_group.get(dominant, 0) + 1

    obj.data.update()
    return {"cleanedIslands": cleaned, "pinnedByGroup": pinned_by_group}


def lance_like_island_pin(obj, ids):
    coords = [obj.data.vertices[idx].co for idx in ids]
    min_x = min(co.x for co in coords)
    max_x = max(co.x for co in coords)
    min_y = min(co.y for co in coords)
    max_y = max(co.y for co in coords)
    min_z = min(co.z for co in coords)
    max_z = max(co.z for co in coords)
    cx = (min_x + max_x) * 0.5
    cy = (min_y + max_y) * 0.5
    x_span = max_x - min_x
    y_span = max_y - min_y
    z_span = max_z - min_z
    if cx < -0.04 and cy < -0.18 and max_z > 1.20 and x_span < 0.16 and z_span > 0.08:
        return "rider_lance"
    return None


def leg_like_island_pin(obj, ids):
    coords = [obj.data.vertices[idx].co for idx in ids]
    min_x = min(co.x for co in coords)
    max_x = max(co.x for co in coords)
    min_y = min(co.y for co in coords)
    max_y = max(co.y for co in coords)
    min_z = min(co.z for co in coords)
    max_z = max(co.z for co in coords)
    cx = (min_x + max_x) * 0.5
    cy = (min_y + max_y) * 0.5
    x_span = max_x - min_x
    y_span = max_y - min_y
    z_span = max_z - min_z
    if abs(cx) < 0.035 or x_span > 0.13 or y_span > 0.18 or z_span > 0.28:
        return None

    side = "L" if cx < 0 else "R"
    if -0.42 < cy < -0.08 and max_z < 0.66:
        if max_z < 0.24:
            return f"front_{side}_hoof"
        if min_z < 0.34:
            return f"front_{side}_lower"
        return f"front_{side}_upper"
    if 0.28 < cy < 0.68 and max_z < 0.66:
        if max_z < 0.24:
            return f"rear_{side}_hoof"
        if min_z < 0.34:
            return f"rear_{side}_lower"
        return f"rear_{side}_upper"
    return None


def reset_pose(arm):
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.location = (0, 0, 0)
        pb.rotation_euler = (0, 0, 0)
        pb.scale = (1, 1, 1)


def keyed_pose(arm, frame, pose):
    bpy.context.scene.frame_set(frame)
    reset_pose(arm)
    for name, values in pose.items():
        if name not in arm.pose.bones:
            continue
        pb = arm.pose.bones[name]
        if "loc" in values:
            pb.location = values["loc"]
        if "rot" in values:
            pb.rotation_euler = values["rot"]
        if "scale" in values:
            pb.scale = values["scale"]
    for pb in arm.pose.bones:
        pb.keyframe_insert("location", frame=frame)
        pb.keyframe_insert("rotation_euler", frame=frame)
        pb.keyframe_insert("scale", frame=frame)


def make_action(arm, name, frames, pose_fn):
    action = bpy.data.actions.new(name)
    arm.animation_data_create()
    arm.animation_data.action = action
    strip_start = 1
    for source_frame in frames:
        local_frame = strip_start + source_frame - frames[0]
        keyed_pose(arm, local_frame, pose_fn(source_frame))
    track = arm.animation_data.nla_tracks.new()
    strip = track.strips.new(name, strip_start, action)
    strip.name = name
    arm.animation_data.action = None
    return action


def add_animations(arm):
    leg_phases = {
        "front_L": 0.0,
        "rear_R": 0.0,
        "front_R": math.pi,
        "rear_L": math.pi,
    }
    gallop_phases = {
        "rear_L": 0.0,
        "rear_R": 0.42,
        "front_L": 1.36,
        "front_R": 1.74,
    }

    def leg_pose(out, prefix, phase, upper_amp, lower_amp, hoof_amp, lift=0.0):
        s = math.sin(phase)
        bend = max(0.0, math.sin(phase - 0.72))
        out[f"{prefix}_upper"] = {"rot": (s * upper_amp, 0, 0)}
        out[f"{prefix}_lower"] = {"rot": (-0.08 + bend * lower_amp, 0, 0)}
        out[f"{prefix}_hoof"] = {"rot": (-max(0.0, math.sin(phase + 0.32)) * hoof_amp, 0, 0)}
        if lift:
            out[f"{prefix}_hoof"]["loc"] = (0, 0, max(0.0, s) * lift)

    def idle_pose(frame):
        p = (frame - 1) / 90.0 * math.tau
        return {
            "root": {"loc": (0, 0, math.sin(p) * 0.018)},
            "spine": {"rot": (math.sin(p + 0.4) * 0.012, 0, 0)},
            "neck": {"rot": (math.sin(p + 0.7) * 0.035, 0, math.sin(p * 0.45) * 0.012)},
            "head": {"rot": (math.sin(p + 1.0) * 0.035, 0, math.sin(p * 0.5) * 0.02)},
            "tail_1": {"rot": (math.sin(p + 0.2) * 0.04, 0, math.sin(p * 0.7) * 0.08)},
            "tail_2": {"rot": (math.sin(p + 0.8) * 0.05, 0, math.sin(p * 0.7 + 0.5) * 0.10)},
            "rider_spine": {"rot": (math.sin(p + 0.3) * 0.010, 0, math.sin(p * 0.55) * 0.010)},
            "rider_head": {"rot": (math.sin(p + 0.8) * 0.012, 0, math.sin(p * 0.45) * 0.018)},
            "rider_lance": {"rot": (math.sin(p + 0.1) * 0.010, 0, math.sin(p * 0.55) * 0.014)},
        }

    def walk_pose(frame):
        p = (frame - 100) / 60.0 * math.tau
        out = {
            "root": {"loc": (0, 0, abs(math.sin(p)) * 0.028)},
            "spine": {"rot": (math.sin(p) * 0.02, 0, math.sin(p * 2.0) * 0.012)},
            "neck": {"rot": (math.sin(p + 0.5) * 0.045, 0, 0)},
            "head": {"rot": (math.sin(p + 0.9) * 0.055, 0, 0)},
            "tail_1": {"rot": (math.sin(p) * 0.06, 0, math.sin(p * 1.15) * 0.13)},
            "tail_2": {"rot": (math.sin(p + 0.7) * 0.08, 0, math.sin(p * 1.15 + 0.4) * 0.17)},
            "rider_spine": {"rot": (math.sin(p + 0.2) * 0.022, 0, math.sin(p * 2.0) * 0.012)},
            "rider_head": {"rot": (math.sin(p + 0.9) * 0.016, 0, -math.sin(p * 2.0) * 0.010)},
            "rider_lance": {"rot": (math.sin(p + 0.35) * 0.018, 0, math.sin(p * 2.0) * 0.018)},
        }
        for key, ph in leg_phases.items():
            leg_pose(out, key, p + ph, 0.34, 0.34, 0.12)
        return out

    def gallop_pose(frame):
        p = (frame - 200) / 48.0 * math.tau
        out = {
            "root": {"loc": (0, 0, 0.025 + max(0.0, math.sin(p)) * 0.08)},
            "spine": {"rot": (math.sin(p - 0.6) * 0.06, 0, math.sin(p) * 0.018)},
            "neck": {"rot": (math.sin(p + 0.2) * 0.075 - 0.015, 0, 0)},
            "head": {"rot": (math.sin(p + 0.6) * 0.08, 0, 0)},
            "tail_1": {"rot": (0.10 + math.sin(p) * 0.11, 0, math.sin(p * 1.25) * 0.18)},
            "tail_2": {"rot": (0.14 + math.sin(p + 0.5) * 0.12, 0, math.sin(p * 1.25 + 0.4) * 0.22)},
            "rider_spine": {"rot": (math.sin(p - 0.15) * 0.040, 0, math.sin(p) * 0.020)},
            "rider_head": {"rot": (math.sin(p + 0.55) * 0.020, 0, -math.sin(p) * 0.014)},
            "rider_lance": {"rot": (math.sin(p + 0.20) * 0.034, 0, math.sin(p) * 0.026)},
        }
        for key, ph in gallop_phases.items():
            leg_pose(out, key, p + ph, 0.72, 0.76, 0.34, lift=0.02)
        return out

    def attack_pose(frame):
        # One-shot mounted lance strike: gather, thrust, recover.
        u = max(0.0, min(1.0, (frame - 300) / 34.0))
        if u < 0.24:
            k = u / 0.24
            thrust = -0.70 * k
            brace = 0.16 * k
        elif u < 0.52:
            k = (u - 0.24) / 0.28
            thrust = -0.70 + 1.85 * k
            brace = 0.18 + 0.26 * math.sin(k * math.pi)
        else:
            k = (u - 0.52) / 0.48
            thrust = 1.15 * (1.0 - k)
            brace = 0.14 * (1.0 - k)

        windup = max(0.0, -thrust)
        hit = max(0.0, thrust)

        out = {
            "root": {"loc": (0, -0.04 + hit * 0.13, brace * 0.08)},
            "spine": {"rot": (-0.025 - hit * 0.10 + windup * 0.04, 0, hit * 0.025)},
            "chest": {"rot": (-0.020 - hit * 0.10, 0, hit * 0.025)},
            "neck": {"rot": (-0.08 - hit * 0.13 + windup * 0.05, 0, 0)},
            "head": {"rot": (-0.06 - hit * 0.14 + windup * 0.05, 0, 0)},
            "rider_spine": {"rot": (-0.05 - hit * 0.30 + windup * 0.12, 0, -hit * 0.08)},
            "rider_head": {"rot": (-0.03 - hit * 0.10 + windup * 0.05, 0, 0)},
            "rider_lance": {
                "loc": (-hit * 0.22, -hit * 0.62 + windup * 0.08, -hit * 0.22 + windup * 0.08),
                "rot": (0.04 + hit * 1.42 - windup * 0.28, hit * 0.10, -0.10 - hit * 0.32 + windup * 0.08),
            },
            "tail_1": {"rot": (0.04 + brace * 0.25, 0, -0.04)},
            "tail_2": {"rot": (0.06 + brace * 0.22, 0, -0.06)},
            "front_L_upper": {"rot": (-0.18 - brace * 0.16, 0, 0)},
            "front_R_upper": {"rot": (-0.10 - brace * 0.12, 0, 0)},
            "front_L_lower": {"rot": (0.10 + brace * 0.12, 0, 0)},
            "front_R_lower": {"rot": (0.06 + brace * 0.10, 0, 0)},
            "front_L_hoof": {"rot": (-0.05, 0, 0)},
            "front_R_hoof": {"rot": (-0.04, 0, 0)},
            "rear_L_upper": {"rot": (0.14 + brace * 0.20, 0, 0)},
            "rear_R_upper": {"rot": (0.10 + brace * 0.16, 0, 0)},
            "rear_L_lower": {"rot": (0.02 + brace * 0.10, 0, 0)},
            "rear_R_lower": {"rot": (0.02 + brace * 0.08, 0, 0)},
        }
        return out

    make_action(arm, "Idle", [1, 31, 61, 91], idle_pose)
    make_action(arm, "Walk", [100, 112, 124, 136, 148, 160], walk_pose)
    make_action(arm, "Gallop", [200, 208, 216, 224, 232, 240, 248], gallop_pose)
    make_action(arm, "Attack", [300, 308, 316, 324, 334], attack_pose)


def main():
    if not SOURCE.exists():
        raise FileNotFoundError(f"Missing source horse GLB: {SOURCE}")
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    mesh, removed_meshes = select_source_mesh()
    budget = decimate_for_runtime(mesh)
    mesh = normalize_source_mesh(mesh)
    arm = create_armature()
    island_cleanup = add_groups(mesh, arm)
    add_animations(arm)

    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 334
    OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=str(OUT),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_animations=True,
        export_nla_strips=True,
        export_materials="EXPORT",
        export_apply=False,
    )
    return {
        "source": str(SOURCE),
        "exported": str(OUT),
        "objects": len(bpy.data.objects),
        "meshes": len(bpy.data.meshes),
        "materials": len(bpy.data.materials),
        "removedMeshes": removed_meshes,
        "faceBudget": budget,
        "islandCleanup": island_cleanup,
        "actions": sorted(a.name for a in bpy.data.actions),
        "bones": sorted(b.name for b in arm.data.bones),
    }


result = main()
