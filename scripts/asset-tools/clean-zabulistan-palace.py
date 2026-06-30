import os
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(os.environ.get("ZABULISTAN_PALACE_SOURCE", ROOT / "public/assets/palaces/ZabulistanKeepPolished.glb"))
OUT = Path(os.environ.get("ZABULISTAN_PALACE_OUT", SOURCE))
CLEAN_MARKER = "__palette_cleaned"


def clamp01(v):
    return max(0.0, min(1.0, v))


def mix(a, b, t):
    return a + (b - a) * t


def warm_palette_pixels(image):
    if not image or not image.size[0] or not image.size[1]:
        return False
    if CLEAN_MARKER in image.name:
        return False
    pixels = list(image.pixels[:])
    lumas = [
        pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722
        for i in range(0, len(pixels), 4)
        if pixels[i + 3] > 0
    ]
    if lumas and min(lumas) >= 0.38 and max(lumas) <= 0.88:
        return False
    warm = (0xB8 / 255.0, 0x8F / 255.0, 0x5E / 255.0)
    shadow = (0x8A / 255.0, 0x68 / 255.0, 0x46 / 255.0)
    light = (0xD8 / 255.0, 0xBC / 255.0, 0x83 / 255.0)
    changed = False
    for i in range(0, len(pixels), 4):
        alpha = pixels[i + 3]
        if alpha <= 0:
            continue
        r, g, b = pixels[i], pixels[i + 1], pixels[i + 2]
        luma = r * 0.2126 + g * 0.7152 + b * 0.0722
        r = mix(r, warm[0], 0.24)
        g = mix(g, warm[1], 0.24)
        b = mix(b, warm[2], 0.24)
        if luma < 0.44:
            t = min(0.92, (0.44 - luma) / 0.44)
            r = mix(r, shadow[0], t)
            g = mix(g, shadow[1], t)
            b = mix(b, shadow[2], t)
        elif luma > 0.72:
            t = min(0.74, (luma - 0.72) / 0.28)
            r = mix(r, light[0], t)
            g = mix(g, light[1], t)
            b = mix(b, light[2], t)
        nr, ng, nb = clamp01(r), clamp01(g), clamp01(b)
        if abs(nr - pixels[i]) > 1e-5 or abs(ng - pixels[i + 1]) > 1e-5 or abs(nb - pixels[i + 2]) > 1e-5:
            changed = True
        pixels[i], pixels[i + 1], pixels[i + 2] = nr, ng, nb
    if changed:
        image.pixels[:] = pixels
        image.name = f"{image.name}{CLEAN_MARKER}"
        image.pack()
    return changed


def image_links_to_socket(material, socket_name):
    if not material or not material.use_nodes:
        return []
    links = []
    for node in material.node_tree.nodes:
        if node.bl_idname != "ShaderNodeTexImage" or not node.image:
            continue
        for output in node.outputs:
            for link in output.links:
                if link.to_socket.name == socket_name:
                    links.append((node, link))
    return links


def clean_materials():
    warmed = set()
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        for node, _link in image_links_to_socket(material, "Base Color"):
            if node.image.name not in warmed and warm_palette_pixels(node.image):
                warmed.add(node.image.name)
        tree = material.node_tree
        for node, link in image_links_to_socket(material, "Emission Color"):
            tree.links.remove(link)
            node.mute = True
        for node in tree.nodes:
            if node.bl_idname != "ShaderNodeBsdfPrincipled":
                continue
            for input_name, value in (
                ("Emission Color", (0.0, 0.0, 0.0, 1.0)),
                ("Emission Strength", 0.0),
                ("Metallic", 0.02),
                ("Roughness", 0.9),
            ):
                socket = node.inputs.get(input_name)
                if socket and not socket.is_linked:
                    socket.default_value = value
    return sorted(warmed)


def main():
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    warmed = clean_materials()
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            obj.name = obj.name.replace("_Mesh_0.001", "_Mesh")
            obj.data.name = obj.data.name.replace("_Mesh_0.001", "_Mesh")
            obj.data.update()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT),
        export_format="GLB",
        export_image_format="WEBP",
        export_image_quality=82,
        export_keep_originals=False,
        export_apply=False,
        export_animations=False,
        export_materials="EXPORT",
        export_yup=True,
    )
    print({"source": str(SOURCE), "out": str(OUT), "warmed": warmed, "objects": len(bpy.context.scene.objects)})


if __name__ == "__main__":
    main()
