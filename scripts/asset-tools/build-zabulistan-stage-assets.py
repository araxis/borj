from pathlib import Path
import math
import os
import random

import bpy


ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "public" / "assets" / "scenery" / "zabulistan"


def make_mat(name, color, roughness=1.0, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    if len(color) > 3 and color[3] < 1:
        mat.blend_method = "BLEND"
        mat.use_screen_refraction = False
        mat.show_transparent_back = False
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if len(color) > 3:
            bsdf.inputs["Alpha"].default_value = color[3]
    return mat


MATS = {
    "stone": make_mat("warm_dark_stone", (0.24, 0.21, 0.16, 1), 0.96),
    "stone_light": make_mat("weathered_sandstone", (0.36, 0.30, 0.21, 1), 0.93),
    "stone_shadow": make_mat("cliff_shadow_stone", (0.14, 0.14, 0.13, 1), 0.98),
    "dust": make_mat("packed_dust", (0.28, 0.22, 0.14, 1), 1.0),
    "dust_dark": make_mat("old_earth_shadow", (0.15, 0.13, 0.10, 1), 1.0),
    "base_earth": make_mat("settled_base_earth", (0.34, 0.27, 0.18, 1), 1.0),
    "stage_earth": make_mat("trampled_stage_earth", (0.27, 0.21, 0.14, 1), 1.0),
    "road_core": make_mat("compacted_gate_road", (0.30, 0.24, 0.16, 1), 1.0),
    "curb": make_mat("weathered_gate_curb", (0.44, 0.38, 0.28, 1), 0.96),
    "dust_soft": make_mat("soft_packed_dust", (0.36, 0.29, 0.18, 0.72), 1.0),
    "dust_wash": make_mat("thin_dust_wash", (0.30, 0.25, 0.17, 0.48), 1.0),
    "ochre": make_mat("faded_ochre_inlay", (0.38, 0.28, 0.14, 1), 0.9),
    "wood": make_mat("sun_dried_wood", (0.24, 0.14, 0.07, 1), 0.86),
    "wood_dark": make_mat("charred_dark_wood", (0.12, 0.075, 0.045, 1), 0.92),
    "bronze": make_mat("aged_bronze", (0.48, 0.31, 0.14, 1), 0.58, 0.32),
    "gold": make_mat("dulled_campaign_gold", (0.68, 0.48, 0.18, 1), 0.5, 0.38),
    "leather": make_mat("dark_saddle_leather", (0.16, 0.085, 0.055, 1), 0.86),
    "cloth_red": make_mat("worn_red_wool", (0.42, 0.08, 0.10, 1), 0.96),
    "cloth_gold": make_mat("worn_ochre_wool", (0.58, 0.38, 0.10, 1), 0.96),
    "cloth_teal": make_mat("weathered_teal_wool", (0.12, 0.36, 0.33, 1), 0.96),
    "rope": make_mat("braided_horse_rope", (0.42, 0.33, 0.18, 1), 0.98),
    "straw": make_mat("dry_feed_straw", (0.56, 0.48, 0.26, 1), 1.0),
}


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def assign(obj, mat):
    obj.data.materials.append(mat)
    obj.select_set(False)
    return obj


def apply_modifier(obj, modifier):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def cube(name, loc, scale, mat, rot=(0, 0, 0), bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, mat)
    if bevel:
        mod = obj.modifiers.new(f"{name}_soft_edges", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        apply_modifier(obj, mod)
        obj.data.polygons.foreach_set("use_smooth", [False] * len(obj.data.polygons))
    return obj


def cylinder(name, loc, radius, depth, vertices, mat, scale=(1, 1, 1), rot=(0, 0, 0), bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, mat)
    if bevel:
        mod = obj.modifiers.new(f"{name}_soft_edge", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        apply_modifier(obj, mod)
    return obj


def cone(name, loc, radius, depth, vertices, mat, scale=(1, 1, 1), rot=(0, 0, 0), bevel=0.0):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=0, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, mat)
    if bevel:
        mod = obj.modifiers.new(f"{name}_soft_tip", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        apply_modifier(obj, mod)
    return obj


def torus(name, loc, major, minor, mat, rot=(0, 0, 0), major_segments=32, minor_segments=8):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=major_segments,
        minor_segments=minor_segments,
        major_radius=major,
        minor_radius=minor,
        location=loc,
        rotation=rot,
    )
    obj = bpy.context.object
    obj.name = name
    assign(obj, mat)
    return obj


def irregular_plate(name, points, height, mat, z=0.0, bevel=0.0):
    verts = []
    for x, y in points:
        verts.append((x, y, z))
    for x, y in points:
        verts.append((x, y, z + height))

    n = len(points)
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, n * 2))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, j + n, i + n))

    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    assign(obj, mat)
    if bevel:
        mod = obj.modifiers.new(f"{name}_worn_edge", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        apply_modifier(obj, mod)
    return obj


def rock(name, loc, scale, mat, seed, rot=(0, 0, 0)):
    rng = random.Random(seed)
    sides = 7 + (seed % 2)
    verts = []
    for rz, rr in [(-0.52, 0.68), (-0.05, 1.0), (0.48, 0.52)]:
        phase = rng.random() * 0.45
        for i in range(sides):
            a = (i / sides) * math.tau + phase
            r = rr * (0.78 + rng.random() * 0.36)
            verts.append((math.cos(a) * r, math.sin(a) * r, rz * (0.84 + rng.random() * 0.28)))
    faces = []
    for ring in [0, 1]:
        start = ring * sides
        nxt = (ring + 1) * sides
        for i in range(sides):
            j = (i + 1) % sides
            faces.append((start + i, start + j, nxt + j, nxt + i))
    faces.append(tuple(range(sides - 1, -1, -1)))
    faces.append(tuple(range(sides * 2, sides * 3)))
    mesh_data = bpy.data.meshes.new(f"{name}_mesh")
    mesh_data.from_pydata(verts, [], faces)
    mesh_data.update()
    obj = bpy.data.objects.new(name, mesh_data)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = rot
    obj.scale = scale
    assign(obj, mat)
    return obj


def embedded_pad_set():
    clear_scene()
    base = [
        (-2.75, -1.82), (-1.2, -2.02), (0.45, -1.92), (2.65, -1.62),
        (2.88, -0.28), (2.48, 1.62), (0.65, 1.88), (-1.72, 1.68), (-2.92, 0.54),
    ]
    irregular_plate("embedded_pad_shadow", base, 0.13, MATS["dust_dark"], 0, 0.035)
    top = [(x * 0.88 + (0.06 if i % 2 else -0.04), y * 0.82) for i, (x, y) in enumerate(base)]
    irregular_plate("embedded_pad_worn_top", top, 0.16, MATS["stone"], 0.11, 0.03)

    tiles = [
        (-1.5, -0.88, 1.12, 0.72, 0.08), (-0.28, -0.92, 1.02, 0.68, -0.05),
        (0.92, -0.74, 1.22, 0.76, 0.04), (-1.38, 0.02, 1.08, 0.72, -0.06),
        (-0.18, -0.02, 1.18, 0.82, 0.03), (1.12, 0.08, 1.0, 0.78, -0.02),
        (-0.78, 0.92, 1.2, 0.58, 0.07), (0.62, 0.9, 1.24, 0.54, -0.08),
    ]
    for i, (x, y, w, d, r) in enumerate(tiles):
        mat = MATS["stone_light"] if i % 3 else MATS["stone"]
        jitter = 0.035 + (i % 3) * 0.012
        pts = [
            (-w * (0.50 - jitter), -d * 0.48),
            (-w * 0.12, -d * (0.54 - jitter)),
            (w * (0.48 + jitter), -d * 0.42),
            (w * 0.54, d * (0.10 + jitter)),
            (w * 0.26, d * 0.50),
            (-w * (0.44 + jitter), d * (0.44 - jitter)),
        ]
        slab = irregular_plate(f"settled_flagstone_{i}", pts, 0.052, mat, 0.32 + (i % 2) * 0.012, 0.014)
        slab.location = (x, y, 0)
        slab.rotation_euler = (0, 0, r)

    for i, (x, y, w, d, r) in enumerate([
        (-2.02, -0.42, 0.54, 0.36, -0.26),
        (1.92, -0.28, 0.48, 0.34, 0.22),
        (-1.74, 0.78, 0.46, 0.3, 0.18),
        (1.68, 0.72, 0.5, 0.32, -0.2),
        (-0.12, 1.22, 0.58, 0.28, 0.08),
    ]):
        pts = [(-w * 0.54, -d * 0.32), (w * 0.36, -d * 0.44), (w * 0.48, d * 0.18), (-w * 0.2, d * 0.46)]
        chip = irregular_plate(f"broken_flagstone_wedge_{i}", pts, 0.04, MATS["stone_shadow" if i % 2 else "stone_light"], 0.382, 0.009)
        chip.location = (x, y, 0)
        chip.rotation_euler = (0, 0, r)

    for i, (x, y, w, d, r) in enumerate([
        (-2.28, -1.42, 0.62, 0.2, -0.12), (-2.45, 1.02, 0.72, 0.18, 0.2),
        (2.25, -1.1, 0.74, 0.18, 0.1), (2.1, 1.18, 0.84, 0.18, -0.15),
        (-0.05, -1.62, 2.3, 0.12, 0.02), (0.2, 1.42, 2.0, 0.12, -0.03),
    ]):
        cube(f"dark_sand_joint_{i}", (x, y, 0.39), (w, d, 0.035), MATS["dust_dark"], (0, 0, r), 0.005)

    for i in range(15):
        a = i * 0.83
        rx = math.cos(a) * (2.34 + (i % 3) * 0.18)
        ry = math.sin(a) * (1.46 + (i % 4) * 0.09)
        rock(f"pad_edge_chip_{i}", (rx, ry, 0.33), (0.28 + (i % 4) * 0.05, 0.12, 0.16 + (i % 5) * 0.035),
             MATS["stone_light"] if i % 2 else MATS["stone_shadow"], 100 + i, (0.2, 0.0, a))


def pad_ground_blend():
    clear_scene()
    outer = [
        (-3.75, -2.38), (-2.15, -2.78), (-0.38, -2.62), (1.62, -2.44),
        (3.42, -1.92), (3.78, -0.52), (3.26, 1.74), (1.34, 2.42),
        (-0.72, 2.58), (-2.84, 2.06), (-3.96, 0.64),
    ]
    irregular_plate("pad_ground_outer_dust", outer, 0.018, MATS["dust_wash"], 0, 0.006)
    mid = [(x * 0.82 + (0.08 if i % 2 else -0.05), y * 0.78) for i, (x, y) in enumerate(outer)]
    irregular_plate("pad_ground_packed_inner", mid, 0.028, MATS["dust_soft"], 0.022, 0.006)

    shelf = [
        (-3.05, -1.84), (-1.6, -2.05), (0.24, -1.96), (2.75, -1.48),
        (3.04, -0.15), (2.52, 1.62), (0.38, 2.03), (-1.85, 1.74), (-3.18, 0.38),
    ]
    irregular_plate("pad_ground_sunken_shelf", shelf, 0.052, MATS["dust_dark"], 0.032, 0.014)

    for i in range(22):
        a = i * 0.57 + (0.16 if i % 2 else -0.08)
        rx = math.cos(a) * (2.85 + (i % 5) * 0.18)
        ry = math.sin(a) * (1.78 + (i % 4) * 0.14)
        mat = MATS["stone_light"] if i % 3 else MATS["stone_shadow"]
        rock(
            f"pad_ground_edge_gravel_{i}",
            (rx, ry, 0.092 + (i % 3) * 0.012),
            (0.17 + (i % 4) * 0.04, 0.075 + (i % 2) * 0.025, 0.11 + (i % 5) * 0.025),
            mat,
            700 + i,
            (0.12, 0.0, a + 0.3),
        )

    for i, (x, y, w, d, r) in enumerate([
        (-2.45, -1.68, 0.82, 0.13, -0.16), (-1.02, 1.74, 0.94, 0.12, 0.11),
        (2.35, -1.28, 0.76, 0.11, 0.18), (2.18, 1.34, 0.9, 0.12, -0.13),
        (-3.08, 0.22, 0.62, 0.10, 0.32), (3.02, 0.48, 0.68, 0.10, -0.22),
    ]):
        cube(f"pad_ground_settled_lip_{i}", (x, y, 0.105), (w, d, 0.05), MATS["stone"], (0, 0, r), 0.01)


def cliff_shoulder_set():
    clear_scene()
    placements = [
        (-2.45, -0.22, 0.72, 0.82, 0.72, 1.42, "stone_shadow"),
        (-1.62, 0.16, 0.86, 0.68, 0.92, 1.84, "stone"),
        (-0.58, -0.08, 1.02, 0.86, 0.72, 2.18, "stone_light"),
        (0.42, 0.18, 0.76, 0.64, 0.78, 1.62, "stone_shadow"),
        (1.24, -0.16, 0.94, 0.84, 0.68, 1.92, "stone"),
        (2.18, 0.12, 0.7, 0.7, 0.88, 1.35, "stone_light"),
    ]
    for i, (x, y, z, sx, sy, sz, mat) in enumerate(placements):
        rock(f"stacked_cliff_mass_{i}", (x, y, z), (sx, sy, sz), MATS[mat], 210 + i, (0.1 * i, 0.18 * i, 0.07 * i))

    shard_points = [(-0.28, -0.12), (0.24, -0.1), (0.36, 0.1), (0.08, 0.22), (-0.3, 0.12)]
    for i, x in enumerate([-1.92, -0.18, 1.58]):
        shard = irregular_plate(f"fractured_upright_slab_{i}", shard_points, 1.45 + i * 0.22, MATS["stone_shadow" if i == 1 else "stone"])
        shard.location = (x, 0.48 - i * 0.18, 0.08)
        shard.rotation_euler = (0.16 - i * 0.08, 0.22 + i * 0.05, -0.28 + i * 0.22)

    for i in range(18):
        x = -3.0 + i * 0.36 + (0.08 if i % 2 else -0.05)
        y = -0.92 + (i % 5) * 0.22
        rock(f"cliff_scree_stone_{i}", (x, y, 0.17), (0.18 + (i % 4) * 0.055, 0.12 + (i % 3) * 0.035, 0.10 + (i % 5) * 0.025),
             MATS["stone_light" if i % 3 else "stone_shadow"], 330 + i, (0.3, 0.0, i * 0.29))


def outer_ridge_wall_set():
    clear_scene()
    base = [
        (-4.2, -1.2), (-2.9, -1.55), (-1.4, -1.35), (0.2, -1.48),
        (1.8, -1.32), (3.6, -1.52), (4.3, -0.52), (3.8, 1.15),
        (1.7, 1.42), (-0.4, 1.2), (-2.4, 1.36), (-4.1, 0.74),
    ]
    irregular_plate("ridge_wall_ground_shadow", base, 0.08, MATS["dust_dark"], 0, 0.012)

    wall_masses = [
        (-3.35, -0.25, 1.65, 0.78, 0.62, 3.1, "stone_shadow"),
        (-2.35, 0.2, 2.25, 0.82, 0.7, 4.1, "stone"),
        (-1.08, -0.15, 1.95, 0.96, 0.66, 3.6, "stone_light"),
        (0.18, 0.08, 2.55, 0.9, 0.72, 4.9, "stone_shadow"),
        (1.38, -0.22, 2.08, 0.84, 0.64, 3.9, "stone"),
        (2.62, 0.18, 2.42, 0.94, 0.76, 4.6, "stone_light"),
        (3.55, -0.08, 1.54, 0.66, 0.58, 2.9, "stone_shadow"),
    ]
    for i, (x, y, z, sx, sy, sz, mat) in enumerate(wall_masses):
        rock(f"outer_ridge_mass_{i}", (x, y, z), (sx, sy, sz), MATS[mat], 520 + i, (0.05 * i, 0.08 * (i % 3), -0.08 + 0.05 * i))

    slab_points = [(-0.34, -0.16), (0.18, -0.22), (0.36, 0.08), (0.06, 0.28), (-0.38, 0.1)]
    for i, (x, y, h, rz, mat) in enumerate([
        (-3.82, 0.42, 2.7, -0.28, "stone_shadow"),
        (-2.05, 0.58, 3.35, 0.18, "stone"),
        (0.58, 0.46, 4.05, -0.08, "stone_shadow"),
        (2.22, 0.52, 3.55, 0.24, "stone"),
        (3.42, 0.38, 2.65, -0.18, "stone_light"),
    ]):
        slab = irregular_plate(f"outer_ridge_sheer_slab_{i}", slab_points, h, MATS[mat])
        slab.location = (x, y, 0.06)
        slab.rotation_euler = (0.05 * (i % 2), 0.16 - i * 0.035, rz)

    for i in range(22):
        x = -3.9 + i * 0.37 + (0.08 if i % 2 else -0.04)
        y = -1.08 + (i % 6) * 0.15
        mat = MATS["stone_light"] if i % 4 else MATS["stone_shadow"]
        rock(f"outer_ridge_scree_{i}", (x, y, 0.2 + (i % 3) * 0.025), (0.18 + (i % 4) * 0.05, 0.11 + (i % 3) * 0.035, 0.12 + (i % 5) * 0.035),
             mat, 610 + i, (0.12, 0.0, i * 0.31))


def road_scree_bank():
    clear_scene()
    strip = [(-1.72, -0.45), (-0.65, -0.58), (1.45, -0.42), (1.8, 0.04), (0.72, 0.42), (-1.54, 0.36)]
    irregular_plate("settled_road_scree_shadow", strip, 0.045, MATS["dust_dark"], 0, 0.012)
    strip_top = [(x * 0.92, y * 0.76) for x, y in strip]
    irregular_plate("settled_road_scree_dust", strip_top, 0.055, MATS["dust"], 0.032, 0.008)

    for i in range(12):
        x = -1.35 + (i % 6) * 0.52 + (0.05 if i % 2 else -0.08)
        y = -0.28 + (i // 6) * 0.46 + ((i % 3) - 1) * 0.04
        mat = MATS["stone_light"] if i % 4 else MATS["stone_shadow"]
        rock(f"road_scree_pebble_{i}", (x, y, 0.13 + (i % 3) * 0.015), (0.16 + (i % 4) * 0.045, 0.10 + (i % 3) * 0.035, 0.08 + (i % 5) * 0.03),
             mat, 440 + i, (0.1, 0.0, i * 0.41))

    for i, (x, y, w, d, r) in enumerate([
        (-0.92, -0.12, 0.55, 0.13, 0.24), (-0.18, 0.22, 0.72, 0.12, -0.1),
        (0.72, -0.18, 0.62, 0.12, 0.06), (1.18, 0.12, 0.46, 0.11, -0.2),
    ]):
        cube(f"broken_road_edge_slab_{i}", (x, y, 0.135), (w, d, 0.055), MATS["stone"], (0, 0, r), 0.012)


def road_apron_breakup():
    clear_scene()
    wash = [(-2.82, -0.68), (-1.56, -0.88), (0.45, -0.72), (2.45, -0.48), (2.88, 0.1), (1.76, 0.62), (-0.26, 0.74), (-2.52, 0.48)]
    irregular_plate("road_apron_outer_wash", wash, 0.018, MATS["dust_wash"], 0, 0.006)
    packed = [(x * 0.9 + (0.04 if i % 2 else -0.06), y * 0.72) for i, (x, y) in enumerate(wash)]
    irregular_plate("road_apron_packed_bank", packed, 0.044, MATS["dust_soft"], 0.018, 0.008)

    for i in range(18):
        x = -2.34 + (i % 9) * 0.58 + (0.06 if i % 2 else -0.08)
        y = -0.42 + (i // 9) * 0.72 + ((i % 4) - 1.5) * 0.035
        mat = MATS["stone_light"] if i % 4 else MATS["stone_shadow"]
        rock(
            f"road_apron_gravel_{i}",
            (x, y, 0.104 + (i % 3) * 0.012),
            (0.14 + (i % 4) * 0.04, 0.07 + (i % 3) * 0.025, 0.08 + (i % 5) * 0.024),
            mat,
            760 + i,
            (0.08, 0.0, i * 0.31),
        )

    for i, (x, y, w, d, r) in enumerate([
        (-1.94, -0.18, 0.74, 0.12, 0.19), (-1.08, 0.28, 0.68, 0.11, -0.12),
        (-0.24, -0.34, 0.84, 0.13, 0.06), (0.68, 0.28, 0.74, 0.12, -0.18),
        (1.55, -0.18, 0.72, 0.12, 0.12), (2.12, 0.18, 0.52, 0.11, -0.24),
    ]):
        cube(f"road_apron_buried_edge_{i}", (x, y, 0.11), (w, d, 0.052), MATS["stone"], (0, 0, r), 0.012)


def forecourt_causeway():
    clear_scene()
    outer = [
        (-5.15, -6.8), (-3.75, -7.38), (-1.38, -7.08), (1.52, -7.18),
        (3.82, -7.02), (5.12, -6.36), (4.55, 6.65), (2.9, 7.22),
        (0.72, 7.02), (-1.7, 7.28), (-3.65, 6.86), (-4.8, 5.95),
    ]
    irregular_plate("forecourt_causeway_dust_wash", outer, 0.022, MATS["dust_wash"], 0, 0.008)
    packed = [(x * 0.82 + (0.05 if i % 2 else -0.04), y * 0.86) for i, (x, y) in enumerate(outer)]
    irregular_plate("forecourt_causeway_packed_earth", packed, 0.045, MATS["dust_soft"], 0.024, 0.01)

    spine = [
        (-3.45, -6.05), (-1.38, -6.28), (1.54, -6.14), (3.48, -5.72),
        (3.12, 5.82), (1.02, 6.28), (-1.55, 6.18), (-3.22, 5.66),
    ]
    irregular_plate("forecourt_causeway_sunken_spine", spine, 0.07, MATS["dust_dark"], 0.048, 0.018)

    row_y = [-5.55, -4.15, -2.72, -1.32, 0.08, 1.5, 2.92, 4.36, 5.64]
    for row, y in enumerate(row_y):
        width = 5.65 - abs(row - 4) * 0.22
        parts = 3 if row % 2 else 4
        cursor = -width / 2
        for col in range(parts):
            seg = width / parts * (0.82 + ((row + col) % 3) * 0.08)
            x = cursor + seg * 0.5 + (0.06 if col % 2 else -0.04)
            cursor += width / parts
            mat = MATS["stone_light"] if (row + col) % 3 else MATS["stone"]
            cube(
                f"causeway_worn_slab_{row}_{col}",
                (x, y + ((col % 2) - 0.5) * 0.08, 0.16 + (row % 2) * 0.006),
                (seg * 0.88, 0.82 + (col % 2) * 0.08, 0.065),
                mat,
                (0, 0, -0.05 + ((row + col) % 5) * 0.026),
                0.016,
            )

    for i, y in enumerate([-6.52, -6.08, 6.05]):
        cube(
            f"causeway_threshold_step_{i}",
            (0.0, y, 0.18 + i * 0.012),
            (7.1 - i * 0.55, 0.18, 0.08),
            MATS["stone_shadow" if i == 0 else "stone"],
            (0, 0, 0.02 if i % 2 else -0.018),
            0.012,
        )

    for i in range(34):
        side = -1 if i % 2 else 1
        y = -6.35 + (i // 2) * 0.78 + ((i % 3) - 1) * 0.06
        x = side * (3.25 + (i % 5) * 0.22 + (0.12 if i % 4 else -0.08))
        mat = MATS["stone_light"] if i % 4 else MATS["stone_shadow"]
        rock(
            f"causeway_edge_rubble_{i}",
            (x, y, 0.13 + (i % 3) * 0.014),
            (0.18 + (i % 4) * 0.055, 0.09 + (i % 2) * 0.03, 0.12 + (i % 5) * 0.03),
            mat,
            820 + i,
            (0.12, 0.0, side * 0.16 + i * 0.24),
        )


def forecourt_retaining_edges():
    clear_scene()
    for side in [-1, 1]:
        for i in range(9):
            y = -5.82 + i * 1.38 + ((i % 2) - 0.5) * 0.1
            x = side * (4.08 + (i % 3) * 0.12)
            h = 0.32 + (i % 4) * 0.055
            mat = MATS["stone_light"] if i % 3 else MATS["stone"]
            cube(
                f"retaining_low_block_{'l' if side < 0 else 'r'}_{i}",
                (x, y, 0.18 + h * 0.5),
                (0.46 + (i % 2) * 0.08, 0.92 + (i % 3) * 0.16, h),
                mat,
                (0, 0, side * (0.05 + (i % 4) * 0.018)),
                0.018,
            )
        for j, y in enumerate([-5.95, -2.0, 2.2, 5.72]):
            cube(
                f"retaining_gate_plinth_{'l' if side < 0 else 'r'}_{j}",
                (side * 4.55, y, 0.34),
                (0.72, 0.62, 0.46),
                MATS["stone_shadow" if j % 2 else "stone"],
                (0, 0, side * (0.08 if j % 2 else -0.04)),
                0.02,
            )

    for i in range(28):
        side = -1 if i % 2 else 1
        y = -6.42 + (i // 2) * 0.96 + ((i % 4) - 1.5) * 0.05
        x = side * (4.7 + (i % 5) * 0.18)
        mat = MATS["stone_light"] if i % 5 else MATS["stone_shadow"]
        rock(
            f"retaining_spill_stone_{i}",
            (x, y, 0.16 + (i % 2) * 0.025),
            (0.19 + (i % 4) * 0.05, 0.11 + (i % 3) * 0.03, 0.13 + (i % 5) * 0.028),
            mat,
            890 + i,
            (0.14, 0.0, i * 0.27),
        )

    for i, (y, w) in enumerate([(-6.42, 8.7), (6.28, 7.25)]):
        cube(
            f"retaining_cross_step_{i}",
            (0, y, 0.21),
            (w, 0.18, 0.11),
            MATS["stone_shadow"],
            (0, 0, 0.018 if i else -0.012),
            0.01,
        )


def palace_base_transition():
    clear_scene()
    shadow = [
        (-8.7, -3.35), (-6.2, -4.34), (-2.8, -4.62), (1.25, -4.45), (5.45, -3.72),
        (8.62, -2.15), (8.94, 1.3), (6.35, 3.08), (2.2, 3.7), (-2.9, 3.54),
        (-6.92, 2.4), (-9.04, 0.25),
    ]
    irregular_plate("palace_base_ground_bed", shadow, 0.036, MATS["base_earth"], 0.0, 0.008)
    packed = [(x * 0.88 + (0.06 if i % 2 else -0.04), y * 0.78) for i, (x, y) in enumerate(shadow)]
    irregular_plate("palace_base_compacted_earth", packed, 0.064, MATS["road_core"], 0.034, 0.012)
    approach = [(-4.4, -4.82), (4.5, -4.64), (4.18, -2.4), (2.46, -1.68), (-2.28, -1.82), (-4.62, -2.62)]
    irregular_plate("palace_base_gate_tread", approach, 0.075, MATS["stage_earth"], 0.082, 0.012)

    for side in [-1, 1]:
        for i, y in enumerate([-3.76, -2.92, -2.08, -1.2, -0.28, 0.7, 1.64, 2.42]):
            width = 0.52 + (i % 3) * 0.08
            depth = 0.74 + (i % 2) * 0.16
            x = side * (4.74 + (i % 2) * 0.12)
            cube(
                f"palace_base_side_curb_{'l' if side < 0 else 'r'}_{i}",
                (x, y, 0.18 + (i % 2) * 0.015),
                (width, depth, 0.18),
                MATS["curb" if i % 3 else "stone_light"],
                (0, 0, side * (0.05 + i * 0.006)),
                0.014,
            )
        for j, y in enumerate([-3.24, -1.74, 0.05, 1.7]):
            cube(
                f"palace_base_flat_threshold_stone_{'l' if side < 0 else 'r'}_{j}",
                (side * (2.18 + j * 0.38), y, 0.145),
                (1.16, 0.28, 0.12),
                MATS["stone_shadow" if j % 2 else "stone_light"],
                (0, 0, side * (0.1 + j * 0.045)),
                0.01,
            )

    for i in range(30):
        side = -1 if i % 2 else 1
        band = i // 2
        x = side * (5.25 + (band % 5) * 0.54 + (0.08 if i % 3 else -0.05))
        y = -3.7 + (band % 10) * 0.68 + ((i % 4) - 1.5) * 0.055
        mat = MATS["stone_shadow"] if i % 5 == 0 else MATS["stone_light"] if i % 3 else MATS["stone"]
        rock(
            f"palace_base_scree_{i}",
            (x, y, 0.16 + (i % 3) * 0.018),
            (0.23 + (i % 4) * 0.055, 0.13 + (i % 3) * 0.035, 0.12 + (i % 5) * 0.026),
            mat,
            1160 + i,
            (0.12, 0.02 * (i % 3), i * 0.21),
        )

    for i, x in enumerate([-3.25, -2.35, -1.24, -0.22, 0.95, 2.08, 3.18]):
        cube(
            f"palace_base_worn_step_slab_{i}",
            (x, -4.22 + (i % 2) * 0.1, 0.17),
            (0.9 + (i % 3) * 0.14, 0.42, 0.11),
            MATS["curb"],
            (0, 0, -0.08 + i * 0.024),
            0.012,
        )


def forecourt_approach_edges():
    clear_scene()
    center = [(-3.2, -4.55), (3.35, -4.45), (3.1, 4.24), (1.45, 4.65), (-1.7, 4.58), (-3.38, 4.1)]
    irregular_plate("forecourt_approach_packed_core", center, 0.052, MATS["road_core"], 0.024, 0.01)
    side_wash_l = [(-5.6, -4.9), (-4.0, -4.62), (-3.74, 4.12), (-5.28, 4.82), (-6.12, 1.12)]
    side_wash_r = [(-x, y + (0.08 if i % 2 else -0.04)) for i, (x, y) in enumerate(side_wash_l)]
    irregular_plate("forecourt_approach_left_shelf", side_wash_l, 0.042, MATS["stage_earth"], 0.018, 0.008)
    irregular_plate("forecourt_approach_right_shelf", side_wash_r, 0.042, MATS["stage_earth"], 0.018, 0.008)

    for side in [-1, 1]:
        for i, y in enumerate([-4.08, -3.18, -2.22, -1.16, -0.08, 1.08, 2.12, 3.14, 4.0]):
            cube(
                f"forecourt_approach_curb_{'l' if side < 0 else 'r'}_{i}",
                (side * (3.72 + (i % 3) * 0.13), y, 0.17 + (i % 2) * 0.018),
                (0.48 + (i % 4) * 0.055, 0.64 + (i % 2) * 0.18, 0.16),
                MATS["curb" if i % 3 else "stone_shadow"],
                (0, 0, side * (0.05 + (i - 4) * 0.012)),
                0.012,
            )
        for j, y in enumerate([-3.52, -2.42, -0.72, 0.76, 2.38, 3.62]):
            rock(
                f"forecourt_approach_edge_stone_{'l' if side < 0 else 'r'}_{j}",
                (side * (4.58 + (j % 2) * 0.34), y, 0.16 + (j % 3) * 0.018),
                (0.22 + (j % 3) * 0.05, 0.12 + (j % 2) * 0.04, 0.11 + (j % 4) * 0.025),
                MATS["stone_light" if j % 2 else "stone_shadow"],
                1240 + j + (0 if side < 0 else 20),
                (0.09, 0.02 * j, side * (0.18 + j * 0.11)),
            )

    for i, y in enumerate([-3.88, -2.64, -1.18, 0.08, 1.56, 2.84, 3.92]):
        cube(
            f"forecourt_approach_cross_wear_{i}",
            (0.08 if i % 2 else -0.12, y, 0.096),
            (2.65 + (i % 3) * 0.34, 0.09, 0.045),
            MATS["dust"],
            (0, 0, -0.08 + i * 0.028),
            0.004,
        )


def cavalry_staging_set():
    clear_scene()
    outer = [
        (-3.45, -1.42), (-2.2, -1.82), (-0.4, -1.72), (1.65, -1.55),
        (3.18, -1.05), (3.44, 0.35), (2.72, 1.35), (0.95, 1.68),
        (-1.42, 1.58), (-3.2, 0.92),
    ]
    irregular_plate("cavalry_staging_dust_wash", outer, 0.018, MATS["dust_wash"], 0, 0.006)
    inner = [(x * 0.86 + (0.05 if i % 2 else -0.04), y * 0.76) for i, (x, y) in enumerate(outer)]
    irregular_plate("cavalry_staging_packed_earth", inner, 0.044, MATS["stage_earth"], 0.018, 0.008)
    tread = [(-2.65, -1.08), (-1.3, -1.22), (0.2, -1.08), (1.5, -0.9), (2.45, -0.58), (2.24, 0.32), (1.08, 0.68), (-0.55, 0.76), (-2.1, 0.58), (-2.72, -0.1)]
    irregular_plate("cavalry_staging_trodden_center", tread, 0.057, MATS["dust"], 0.012, 0.006)

    for i, x in enumerate([-2.58, -0.86, 0.86, 2.58]):
        cylinder(f"hitch_post_{i}", (x, -0.42, 0.52), 0.075, 1.04, 8, MATS["wood_dark"], bevel=0.01)
        cone(f"hitch_post_cap_{i}", (x, -0.42, 1.15), 0.12, 0.18, 8, MATS["bronze"], bevel=0.005)
    cylinder("upper_hitch_rail", (0, -0.42, 0.82), 0.04, 5.38, 8, MATS["wood"], rot=(0, math.pi / 2, 0), bevel=0.004)
    cylinder("lower_rope_line", (0, -0.62, 0.55), 0.024, 4.92, 7, MATS["rope"], rot=(0, math.pi / 2, 0))

    cube("saddle_stand_beam", (-1.12, 0.48, 0.62), (1.55, 0.20, 0.16), MATS["wood_dark"], (0, 0, -0.08), 0.012)
    for i, x in enumerate([-1.76, -0.52]):
        cylinder(f"saddle_stand_leg_{i}", (x, 0.48, 0.34), 0.035, 0.66, 6, MATS["wood"], rot=(0.18 if i else -0.18, 0, 0.18 if i else -0.12))
    cube("folded_red_saddle_blanket", (-1.12, 0.48, 0.78), (1.1, 0.58, 0.12), MATS["cloth_red"], (0, 0, -0.08), 0.018)
    cube("dark_saddle_pad", (-1.08, 0.42, 0.92), (0.86, 0.46, 0.12), MATS["leather"], (0, 0, 0.08), 0.018)
    cube("ochre_tack_roll", (-0.62, 0.92, 0.42), (1.04, 0.22, 0.20), MATS["cloth_gold"], (0, 0, 0.16), 0.018)

    shield_specs = [(-0.1, 0.78, "cloth_teal"), (0.74, 0.82, "bronze"), (1.54, 0.76, "cloth_red")]
    for i, (x, z, mat_key) in enumerate(shield_specs):
        cylinder(
            f"round_cavalry_shield_{i}",
            (x, 0.72, z),
            0.36,
            0.06,
            24,
            MATS[mat_key],
            scale=(1.0, 1.18, 1.0),
            rot=(math.pi / 2, 0, 0.06 * (i - 1)),
            bevel=0.006,
        )
        cylinder(
            f"shield_boss_{i}",
            (x, 0.68, z),
            0.115,
            0.052,
            16,
            MATS["gold" if i == 1 else "bronze"],
            rot=(math.pi / 2, 0, 0),
            bevel=0.004,
        )

    cube("feed_trough_base", (1.42, -0.9, 0.16), (1.26, 0.44, 0.22), MATS["wood_dark"], (0, 0, -0.08), 0.012)
    cube("feed_trough_left_lip", (0.78, -0.9, 0.36), (0.08, 0.5, 0.24), MATS["wood"], (0, 0, -0.08), 0.008)
    cube("feed_trough_right_lip", (2.06, -0.9, 0.36), (0.08, 0.5, 0.24), MATS["wood"], (0, 0, -0.08), 0.008)
    for i in range(6):
        cube(
            f"feed_straw_{i}",
            (1.05 + i * 0.13, -0.91 + ((i % 3) - 1) * 0.045, 0.42 + (i % 2) * 0.018),
            (0.24, 0.035, 0.028),
            MATS["straw"],
            (0, 0, -0.22 + i * 0.07),
            0.002,
        )

    for i in range(6):
        x = -2.2 + i * 0.18
        cylinder(
            f"stacked_lance_{i}",
            (x, 0.84 + (i % 2) * 0.06, 1.1 + i * 0.018),
            0.018,
            2.55 + (i % 3) * 0.16,
            6,
            MATS["wood"],
            rot=(0.55, -0.08 + i * 0.025, -0.24 + i * 0.06),
        )
        cone(
            f"stacked_lance_tip_{i}",
            (x + 0.28 + i * 0.025, 1.44 + (i % 2) * 0.04, 2.06 + i * 0.04),
            0.04,
            0.16,
            6,
            MATS["bronze"],
            rot=(0.55, -0.08 + i * 0.025, -0.24 + i * 0.06),
        )

    for i, x in enumerate([2.48, 2.7, 2.92]):
        cylinder(
            f"upright_lance_{i}",
            (x, 0.52 + i * 0.035, 1.38),
            0.025,
            2.35 + i * 0.18,
            7,
            MATS["wood_dark"],
            rot=(0.08 + i * 0.025, 0.02, -0.08 + i * 0.04),
        )
        cone(
            f"upright_lance_tip_{i}",
            (x + 0.1 + i * 0.015, 0.43 + i * 0.035, 2.62 + i * 0.18),
            0.052,
            0.18,
            7,
            MATS["bronze"],
            rot=(0.08 + i * 0.025, 0.02, -0.08 + i * 0.04),
        )
    cube("small_red_pennant", (2.78, 0.42, 2.08), (0.08, 0.48, 0.32), MATS["cloth_red"], (0.08, 0, -0.18), 0.006)
    cube("small_gold_pennant", (2.56, 0.5, 1.84), (0.07, 0.38, 0.26), MATS["cloth_gold"], (0.06, 0, 0.14), 0.006)

    torus("left_rope_coil", (-2.52, 0.32, 0.12), 0.23, 0.025, MATS["rope"], major_segments=28, minor_segments=6)
    torus("right_rope_coil", (2.42, 0.42, 0.12), 0.2, 0.022, MATS["rope"], major_segments=26, minor_segments=6)
    torus("hanging_rein_loop", (-2.02, -0.45, 0.78), 0.18, 0.018, MATS["rope"], rot=(math.pi / 2, 0, 0), major_segments=24, minor_segments=6)
    torus("small_bronze_bit", (-1.78, -0.42, 0.72), 0.09, 0.012, MATS["bronze"], rot=(math.pi / 2, 0, 0), major_segments=18, minor_segments=5)

    for i in range(16):
        x = -3.0 + (i % 8) * 0.78 + (0.08 if i % 2 else -0.06)
        y = -1.18 + (i // 8) * 2.05 + ((i % 4) - 1.5) * 0.06
        mat = MATS["stone_light"] if i % 3 else MATS["stone_shadow"]
        rock(
            f"cavalry_staging_anchor_stone_{i}",
            (x, y, 0.12 + (i % 3) * 0.012),
            (0.16 + (i % 4) * 0.04, 0.09 + (i % 2) * 0.03, 0.09 + (i % 5) * 0.025),
            mat,
            980 + i,
            (0.12, 0.0, i * 0.31),
        )


def gate_cliff_siege_set():
    clear_scene()
    shadow = [
        (-5.4, -4.6), (-3.1, -5.1), (-0.8, -4.72), (2.35, -4.3),
        (4.74, -2.62), (5.12, 0.22), (4.36, 3.52), (2.1, 4.82),
        (-0.92, 5.06), (-3.82, 4.14), (-5.18, 1.38),
    ]
    irregular_plate("gate_depth_shadow_wash", shadow, 0.026, MATS["dust_wash"], 0.0, 0.006)
    tread = [
        (-3.82, -3.72), (-2.08, -4.08), (0.52, -3.76), (2.88, -2.86),
        (3.45, -0.55), (3.02, 2.48), (1.42, 3.55), (-1.18, 3.72),
        (-3.36, 2.58), (-4.02, -0.1),
    ]
    irregular_plate("gate_depth_trampled_shelf", tread, 0.054, MATS["stage_earth"], 0.02, 0.008)

    masses = [
        (-3.8, -2.55, 1.1, 1.25, 1.0, 2.55, 1320),
        (-3.9, 0.65, 1.42, 1.42, 1.18, 3.05, 1321),
        (-2.55, 3.12, 0.96, 1.05, 0.8, 2.08, 1322),
        (3.42, -2.2, 1.0, 1.28, 0.96, 2.34, 1323),
        (3.72, 0.9, 1.34, 1.52, 1.22, 2.82, 1324),
        (2.18, 3.36, 0.9, 1.0, 0.82, 1.95, 1325),
        (-0.48, 4.05, 0.62, 1.72, 0.66, 1.1, 1326),
        (0.52, -4.02, 0.54, 1.82, 0.62, 1.0, 1327),
    ]
    for i, (x, y, z, sx, sy, sz, seed) in enumerate(masses):
        rock(
            f"gate_depth_cliff_mass_{i}",
            (x, y, z),
            (sx, sy, sz),
            MATS["stone_shadow" if i % 3 == 1 else "stone" if i % 2 else "stone_light"],
            seed,
            (0.08 * (i % 3), 0.03 * (i % 2), -0.28 + i * 0.17),
        )

    for i, (x, y, w, d, h, z, rot) in enumerate([
        (-3.28, -0.76, 1.65, 1.18, 0.18, 1.42, -0.08),
        (3.18, -0.42, 1.55, 1.26, 0.16, 1.32, 0.08),
        (-2.24, 2.46, 1.32, 1.02, 0.14, 1.03, 0.16),
        (2.04, 2.72, 1.22, 0.94, 0.13, 0.94, -0.14),
    ]):
        cube(
            f"gate_depth_cut_terrace_{i}",
            (x, y, z),
            (w, d, h),
            MATS["curb" if i % 2 else "stone"],
            (0.04 if i % 2 else -0.03, 0.0, rot),
            0.012,
        )

    for side in [-1, 1]:
        base_x = side * 2.65
        for i, y in enumerate([-2.88, -2.08, -1.28, -0.48, 0.36]):
            cylinder(
                f"gate_depth_palisade_post_{'l' if side < 0 else 'r'}_{i}",
                (base_x + side * ((i % 2) * 0.18), y, 1.12 + (i % 2) * 0.08),
                0.055,
                1.95 + (i % 3) * 0.22,
                6,
                MATS["wood_dark" if i % 2 else "wood"],
                rot=(0.12 * side, 0.03 * i, side * 0.08),
                bevel=0.004,
            )
            cone(
                f"gate_depth_palisade_tip_{'l' if side < 0 else 'r'}_{i}",
                (base_x + side * ((i % 2) * 0.18), y, 2.2 + (i % 2) * 0.1),
                0.11,
                0.34,
                6,
                MATS["wood"],
                rot=(0.12 * side, 0.03 * i, side * 0.08),
                bevel=0.004,
            )
        cylinder(
            f"gate_depth_low_lash_{'l' if side < 0 else 'r'}",
            (base_x + side * 0.04, -1.28, 1.05),
            0.035,
            3.72,
            7,
            MATS["rope"],
            rot=(math.pi / 2, 0.0, side * 0.06),
        )
        cylinder(
            f"gate_depth_upper_lash_{'l' if side < 0 else 'r'}",
            (base_x + side * 0.08, -1.18, 1.72),
            0.04,
            3.28,
            7,
            MATS["wood_dark"],
            rot=(math.pi / 2, 0.0, side * 0.04),
        )

    for side in [-1, 1]:
        sx = side * 1.45
        cube(f"gate_depth_siege_sill_{side}", (sx, 1.5, 0.42), (1.78, 0.3, 0.22), MATS["wood_dark"], (0, 0, side * 0.08), 0.01)
        for i, x in enumerate([-0.72, 0.72]):
            cylinder(
                f"gate_depth_siege_upright_{side}_{i}",
                (sx + x, 1.44 + side * 0.08, 1.42),
                0.055,
                2.05,
                7,
                MATS["wood"],
                rot=(0.12 if i else -0.1, side * 0.06, side * (0.12 if i else -0.1)),
                bevel=0.004,
            )
        cylinder(
            f"gate_depth_siege_cross_{side}_a",
            (sx, 1.42, 1.56),
            0.04,
            1.86,
            7,
            MATS["wood_dark"],
            rot=(0.0, math.pi / 2, side * 0.2),
        )
        cylinder(
            f"gate_depth_siege_cross_{side}_b",
            (sx, 1.62, 2.18),
            0.036,
            1.62,
            7,
            MATS["wood_dark"],
            rot=(0.0, math.pi / 2, -side * 0.16),
        )
        cylinder(
            f"gate_depth_siege_wheel_{side}_l",
            (sx - 0.72, 1.03, 0.28),
            0.22,
            0.12,
            16,
            MATS["wood"],
            rot=(math.pi / 2, 0, 0),
            bevel=0.004,
        )
        cylinder(
            f"gate_depth_siege_wheel_{side}_r",
            (sx + 0.72, 1.03, 0.28),
            0.22,
            0.12,
            16,
            MATS["wood"],
            rot=(math.pi / 2, 0, 0),
            bevel=0.004,
        )

    for i, (x, y, mat_key) in enumerate([(-2.6, 1.92, "cloth_red"), (2.55, 2.02, "cloth_gold")]):
        cylinder(f"gate_depth_standard_pole_{i}", (x, y, 1.42), 0.035, 2.24, 7, MATS["wood_dark"], bevel=0.004)
        cube(
            f"gate_depth_standard_cloth_{i}",
            (x + (0.16 if i else -0.16), y, 2.0),
            (0.07, 0.56, 0.74),
            MATS[mat_key],
            (0.02, 0.0, 0.08 if i else -0.08),
            0.004,
        )
        cone(f"gate_depth_standard_finial_{i}", (x, y, 2.62), 0.08, 0.2, 8, MATS["bronze"], bevel=0.004)

    for i in range(28):
        angle = i * 0.64
        x = math.cos(angle) * (3.3 + (i % 4) * 0.32) + ((i % 3) - 1) * 0.2
        y = math.sin(angle) * (2.9 + (i % 5) * 0.26)
        if abs(x) < 1.15 and y < 1.2:
            x += 1.45 if i % 2 else -1.45
        rock(
            f"gate_depth_scree_{i}",
            (x, y, 0.11 + (i % 3) * 0.014),
            (0.17 + (i % 4) * 0.045, 0.1 + (i % 2) * 0.035, 0.08 + (i % 5) * 0.025),
            MATS["stone_light" if i % 2 else "stone_shadow"],
            1400 + i,
            (0.08, 0.01 * (i % 3), i * 0.27),
        )


def export_glb(filename, builder):
    builder()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / filename
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
    )
    print(f"Wrote {path}")


EXPORTS = [
    ("embedded-pad-set.glb", embedded_pad_set),
    ("pad-ground-blend.glb", pad_ground_blend),
    ("cliff-shoulder-set.glb", cliff_shoulder_set),
    ("outer-ridge-wall-set.glb", outer_ridge_wall_set),
    ("road-scree-bank.glb", road_scree_bank),
    ("road-apron-breakup.glb", road_apron_breakup),
    ("palace-base-transition.glb", palace_base_transition),
    ("forecourt-causeway.glb", forecourt_causeway),
    ("forecourt-retaining-edges.glb", forecourt_retaining_edges),
    ("forecourt-approach-edges.glb", forecourt_approach_edges),
    ("cavalry-staging-set.glb", cavalry_staging_set),
    ("gate-cliff-siege-set.glb", gate_cliff_siege_set),
]


def main():
    selected = {
        item.strip()
        for item in os.environ.get("ZABULISTAN_STAGE_EXPORTS", "").split(",")
        if item.strip()
    }
    for filename, builder in EXPORTS:
        stem = filename[:-4] if filename.endswith(".glb") else filename
        if selected and filename not in selected and stem not in selected:
            continue
        export_glb(filename, builder)


if __name__ == "__main__":
    main()
