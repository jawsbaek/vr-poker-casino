"""
Headless Blender 5.2 High-Detail Character & Prop Generator
Monte Carlo Salon Prive — Master Croupier (Dealer) 3D Model

Generates:
  public/models/vip_dealer.glb

Hierarchy exported (matching CasinoScene.ts articulated pivots 1:1):
  - Dealer_Torso     (origin at dealerGroup 0,0,0 -> world 0, 0.75, -1.14)
  - Dealer_Head      (origin at dealerHeadGroup 0, 0.61, 0)
  - Dealer_LeftArm   (origin at dealerLeftArm -0.175, 0.39, -0.01)
  - Dealer_RightArm  (origin at dealerRightArm +0.175, 0.39, -0.01)

Coordinate Mapping (Blender Z-up -> Three.js Y-up glTF 2.0):
  X_three =  X_blender
  Y_three =  Z_blender
  Z_three = -Y_blender  (so +Z_three forward toward table is -Y_blender)

Run via:
  /Users/User/.local/bin/blender -b -P scripts/blender_generate_dealer.py
"""

import bpy
import bmesh
import math
import mathutils
import os

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PBR_DIR = os.path.join(PROJECT_ROOT, "public", "assets", "pbr")
OUT_DIR = os.path.join(PROJECT_ROOT, "public", "models")


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def t2b(x_t, y_t, z_t):
    """Converts Three.js local (x, y, z) coordinates to Blender (x, y, z) so glTF export maps 1:1."""
    return (x_t, -z_t, y_t)


def r_t2b(rx_t, ry_t, rz_t):
    """Converts Three.js Euler (rx, ry, rz) to Blender Euler (rx, -rz, ry)."""
    return (rx_t, -rz_t, ry_t)


def load_image_safe(filename, is_data=False):
    path = os.path.join(PBR_DIR, filename)
    if not os.path.exists(path):
        return None
    img = bpy.data.images.load(path, check_existing=True)
    if is_data and hasattr(img, "colorspace_settings"):
        img.colorspace_settings.name = "Non-Color"
    return img


def create_pbr_material(
    name,
    base_color,
    roughness=0.4,
    metallic=0.0,
    clearcoat=0.0,
    clearcoat_roughness=0.1,
    subsurface=0.0,
    alpha=1.0,
    emission_color=None,
    emission_strength=0.0,
    diff_tex=None,
    rough_tex=None,
    nor_tex=None,
    nor_strength=0.5,
    tint_color=None,
):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if not bsdf:
        return mat

    bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic

    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = clearcoat
        bsdf.inputs["Coat Roughness"].default_value = clearcoat_roughness
    elif "Clearcoat" in bsdf.inputs:
        bsdf.inputs["Clearcoat"].default_value = clearcoat
        bsdf.inputs["Clearcoat Roughness"].default_value = clearcoat_roughness

    if subsurface > 0.0 and "Subsurface Weight" in bsdf.inputs:
        bsdf.inputs["Subsurface Weight"].default_value = subsurface

    if alpha < 1.0:
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = alpha
        if hasattr(mat, "blend_method"):
            mat.blend_method = "BLEND"

    if emission_color and emission_strength > 0.0:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission_color, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength

    if diff_tex:
        img = load_image_safe(diff_tex, is_data=False)
        if img:
            tex_node = nodes.new("ShaderNodeTexImage")
            tex_node.image = img
            if tint_color:
                mix_node = nodes.new("ShaderNodeMix")
                mix_node.data_type = "RGBA"
                mix_node.blend_type = "MULTIPLY"
                mix_node.inputs[0].default_value = 0.90
                mix_node.inputs[7].default_value = (*tint_color, 1.0)
                links.new(tex_node.outputs["Color"], mix_node.inputs[6])
                links.new(mix_node.outputs[2], bsdf.inputs["Base Color"])
            else:
                links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])

    if rough_tex:
        img = load_image_safe(rough_tex, is_data=True)
        if img:
            tex_node = nodes.new("ShaderNodeTexImage")
            tex_node.image = img
            links.new(tex_node.outputs["Color"], bsdf.inputs["Roughness"])

    if nor_tex:
        img = load_image_safe(nor_tex, is_data=True)
        if img:
            tex_node = nodes.new("ShaderNodeTexImage")
            tex_node.image = img
            nor_node = nodes.new("ShaderNodeNormalMap")
            nor_node.inputs["Strength"].default_value = nor_strength
            links.new(tex_node.outputs["Color"], nor_node.inputs["Color"])
            links.new(nor_node.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def finalize_part(obj, mat, parent=None, subsurf_levels=0, smooth=True):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    if subsurf_levels > 0:
        mod = obj.modifiers.new(name="Subsurf", type="SUBSURF")
        mod.levels = subsurf_levels
        mod.render_levels = subsurf_levels
        bpy.ops.object.modifier_apply(modifier=mod.name)

    if smooth and obj.type == "MESH":
        for poly in obj.data.polygons:
            poly.use_smooth = True

    if mat and obj.type == "MESH":
        if len(obj.data.materials) == 0:
            obj.data.materials.append(mat)
        else:
            obj.data.materials[0] = mat

    if parent:
        obj.parent = parent

    obj.select_set(False)
    return obj


def add_Part_Three(prim_fn, name, loc_t, scale_t=(1, 1, 1), rot_t=(0, 0, 0), mat=None, parent=None, subsurf=0):
    """Creates a primitive in Three.js local coordinates (x_t, y_t, z_t) and converts to Blender space."""
    prim_fn(location=t2b(*loc_t))
    obj = bpy.context.active_object
    obj.name = name
    # Scale mapping: X->X, Y_three->Z_blender, Z_three->Y_blender
    obj.scale = (scale_t[0], scale_t[2], scale_t[1])
    obj.rotation_euler = r_t2b(*rot_t)
    return finalize_part(obj, mat, parent=parent, subsurf_levels=subsurf, smooth=True)


def build_sculpted_head_mesh(name, mat_skin, parent):
    """
    Builds an organically sculpted human head & neck using BMesh vertex shaping + Subdivision Surface.
    Centered at (0,0,0) in Dealer_Head local space (radius ~0.102m).
    """
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=36, v_segments=28, radius=0.102)

    for v in bm.verts:
        # Convert Blender vertex (x, y, z) to Three.js (x, y_up=z, z_fwd=-y) for intuitive anatomical sculpting
        xt = v.co.x
        yt = v.co.z
        zt = -v.co.y

        # Slight cranial elongation & narrower temples
        xt *= 0.94
        yt *= 1.06

        # Taper lower jaw & chin (yt < 0)
        if yt < 0.0:
            jaw_t = min(1.0, abs(yt) / 0.102)
            # Narrower toward the chin, slightly projecting chin forward
            xt *= (1.0 - 0.24 * (jaw_t ** 1.3))
            if zt > 0:
                zt *= (1.0 + 0.08 * math.sin(jaw_t * math.pi))

        # Subtle cheekbone prominence (yt around -0.01..0.02, zt > 0.03)
        if -0.025 < yt < 0.025 and zt > 0.02:
            cheek_factor = math.exp(-((yt - 0.0) ** 2) / 0.0004)
            xt *= (1.0 + 0.055 * cheek_factor)

        # Subtle brow ridge prominence (yt around 0.022..0.045, zt > 0.05)
        if 0.018 < yt < 0.048 and zt > 0.05:
            brow_factor = math.exp(-((yt - 0.032) ** 2) / 0.00015)
            zt += 0.0055 * brow_factor

        # Eye socket subtle recession (yt around 0.012, xt around ±0.035, zt > 0.06)
        for dir_x in (-1.0, 1.0):
            dist_eye = math.hypot(xt - dir_x * 0.035, yt - 0.012)
            if dist_eye < 0.024 and zt > 0.05:
                socket_depth = math.cos((dist_eye / 0.024) * (math.pi / 2))
                zt -= 0.0065 * socket_depth

        v.co.x = xt
        v.co.y = -zt
        v.co.z = yt

    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()

    finalize_part(obj, mat_skin, parent=parent, subsurf_levels=1, smooth=True)

    # Sculpted Neck with Sternocleidomastoid taper into shirt collar
    add_Part_Three(
        lambda location: bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=0.046, depth=0.145, location=location),
        "Dealer_Neck",
        (0.0, -0.088, -0.006),
        scale_t=(0.96, 1.0, 1.02),
        mat=mat_skin,
        parent=parent,
    )


def build_dealer_head(mats):
    head_root = bpy.data.objects.new("Dealer_Head", None)
    bpy.context.collection.objects.link(head_root)
    head_root.location = (0.0, 0.0, 0.0)

    r = 0.102
    build_sculpted_head_mesh("Dealer_Head_Cranium", mats["skin"], head_root)

    # 1. Sculpted 3D Nose (Bridge + Rounded Tip + Nostril Wings)
    add_Part_Three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=14, radius=0.012, location=location),
        "Dealer_NoseBridge",
        (0.0, 0.006, r * 0.965),
        scale_t=(0.72, 1.65, 0.95),
        rot_t=(-0.18, 0.0, 0.0),
        mat=mats["skin_nose"],
        parent=head_root,
    )
    add_Part_Three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=14, radius=0.0115, location=location),
        "Dealer_NoseTip",
        (0.0, -0.006, r * 1.02),
        scale_t=(0.95, 0.78, 0.92),
        mat=mats["skin_nose"],
        parent=head_root,
    )
    for dir_x in (-1.0, 1.0):
        add_Part_Three(
            lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=0.0075, location=location),
            f"Dealer_NostrilWing_{'L' if dir_x < 0 else 'R'}",
            (dir_x * 0.009, -0.009, r * 0.985),
            scale_t=(0.95, 0.72, 0.85),
            mat=mats["skin_nose"],
            parent=head_root,
        )

    # 2. Sculpted Anatomical Ears (Outer Helix + Inner Concha + Lobe)
    for dir_x in (-1.0, 1.0):
        tag = "L" if dir_x < 0 else "R"
        add_Part_Three(
            lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=14, radius=0.022, location=location),
            f"Dealer_Ear_{tag}",
            (dir_x * (r * 0.92), -0.006, -0.008),
            scale_t=(0.38, 0.95, 0.62),
            rot_t=(-0.1, dir_x * -0.18, dir_x * -0.08),
            mat=mats["skin_nose"],
            parent=head_root,
        )

    # 3. Layered Realistic Eyes (Sclera, Espresso Iris, Pupil, Upper/Lower Eyelids)
    eye_x = r * 0.335
    eye_y = r * 0.125
    eye_z = r * 0.885
    for dir_x in (-1.0, 1.0):
        tag = "L" if dir_x < 0 else "R"
        add_Part_Three(
            lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=16, radius=0.0145, location=location),
            f"Dealer_Sclera_{tag}",
            (dir_x * eye_x, eye_y, eye_z),
            scale_t=(1.15, 0.84, 0.55),
            rot_t=(0.0, dir_x * 0.15, 0.0),
            mat=mats["sclera"],
            parent=head_root,
        )
        add_Part_Three(
            lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=14, radius=0.0086, location=location),
            f"Dealer_Iris_{tag}",
            (dir_x * (eye_x + 0.001), eye_y, eye_z + 0.0068),
            scale_t=(1.0, 1.0, 0.40),
            rot_t=(0.0, dir_x * 0.15, 0.0),
            mat=mats["iris"],
            parent=head_root,
        )
        add_Part_Three(
            lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=12, radius=0.0048, location=location),
            f"Dealer_Pupil_{tag}",
            (dir_x * (eye_x + 0.0012), eye_y, eye_z + 0.0094),
            scale_t=(1.0, 1.0, 0.38),
            rot_t=(0.0, dir_x * 0.15, 0.0),
            mat=mats["pupil"],
            parent=head_root,
        )
        # Upper Eyelid Crease
        add_Part_Three(
            lambda location: bpy.ops.mesh.primitive_torus_add(
                major_radius=0.0135, minor_radius=0.0028, major_segments=20, minor_segments=10, location=location
            ),
            f"Dealer_UpperEyelid_{tag}",
            (dir_x * eye_x, eye_y + 0.0045, eye_z + 0.003),
            scale_t=(1.15, 0.55, 0.65),
            rot_t=(1.35, dir_x * 0.14, dir_x * -0.06),
            mat=mats["skin_nose"],
            parent=head_root,
        )
        # Sculpted Arched Eyebrows
        add_Part_Three(
            lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=12, radius=0.015, location=location),
            f"Dealer_Eyebrow_{tag}",
            (dir_x * eye_x, eye_y + 0.022, eye_z + 0.006),
            scale_t=(1.22, 0.28, 0.38),
            rot_t=(0.0, dir_x * 0.16, dir_x * -0.08),
            mat=mats["hair"],
            parent=head_root,
        )

    # 4. Sculpted Lips, Dapper Handlebar Mustache & Groomed Van Dyke Goatee
    add_Part_Three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=12, radius=0.014, location=location),
        "Dealer_LowerLip",
        (0.0, -r * 0.34, r * 0.945),
        scale_t=(1.15, 0.28, 0.52),
        mat=mats["lip"],
        parent=head_root,
    )
    for dir_x in (-1.0, 1.0):
        tag = "L" if dir_x < 0 else "R"
        # Swept handlebar mustache wing
        add_Part_Three(
            lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=14, radius=0.014, location=location),
            f"Dealer_MustacheWing_{tag}",
            (dir_x * 0.013, -r * 0.235, r * 0.965),
            scale_t=(1.25, 0.42, 0.52),
            rot_t=(0.0, dir_x * 0.18, dir_x * -0.22),
            mat=mats["hair"],
            parent=head_root,
        )
        # Curled mustache tip
        add_Part_Three(
            lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=0.0055, location=location),
            f"Dealer_MustacheCurl_{tag}",
            (dir_x * 0.027, -r * 0.245, r * 0.935),
            scale_t=(1.1, 0.85, 0.85),
            mat=mats["hair"],
            parent=head_root,
        )
        # Groomed Sideburns
        add_Part_Three(
            lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=12, radius=0.016, location=location),
            f"Dealer_Sideburn_{tag}",
            (dir_x * (r * 0.905), 0.002, r * 0.22),
            scale_t=(0.35, 1.45, 0.65),
            rot_t=(0.12, 0.0, 0.0),
            mat=mats["hair"],
            parent=head_root,
        )

    # Soul Patch & Contoured Chin Goatee
    add_Part_Three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=12, radius=0.007, location=location),
        "Dealer_SoulPatch",
        (0.0, -r * 0.42, r * 0.94),
        scale_t=(0.75, 1.15, 0.55),
        mat=mats["hair"],
        parent=head_root,
    )
    add_Part_Three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=18, radius=0.028, location=location),
        "Dealer_ChinGoatee",
        (0.0, -r * 0.59, r * 0.79),
        scale_t=(0.96, 0.82, 0.72),
        rot_t=(0.24, 0.0, 0.0),
        mat=mats["hair"],
        parent=head_root,
    )

    # 5. Subdivision-Sculpted Side-Parted Luxury Croupier Coiffure (Hair Cap + Swept Pompadour Waves)
    mesh_hair = bpy.data.meshes.new("Dealer_HairCap_Mesh")
    obj_hair = bpy.data.objects.new("Dealer_HairCap", mesh_hair)
    bpy.context.collection.objects.link(obj_hair)
    bm_h = bmesh.new()
    bmesh.ops.create_uvsphere(bm_h, u_segments=36, v_segments=28, radius=r * 1.045)
    to_del = []
    for v in bm_h.verts:
        xt = v.co.x
        yt = v.co.z
        zt = -v.co.y
        # Keep crown, back of head, and temples; cut out face area (zt > 0.015 and yt < 0.055)
        if (zt > 0.018 and yt < 0.055) or yt < -0.052:
            to_del.append(v)
        else:
            xt *= 0.96
            yt *= 1.07
            # Add volume on top right of part
            if yt > 0.05:
                yt += 0.008 * (1.0 + 0.25 * math.sin(xt * 25.0))
            v.co.x = xt
            v.co.y = -zt
            v.co.z = yt
    bmesh.ops.delete(bm_h, geom=to_del, context="VERTS")
    bm_h.normal_update()
    bm_h.to_mesh(mesh_hair)
    bm_h.free()
    finalize_part(obj_hair, mats["hair"], parent=head_root, subsurf_levels=1, smooth=True)

    # Sculpted Front Swept Pompadour Wave & Side-Part Lock
    add_Part_Three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=18, radius=0.056, location=location),
        "Dealer_HairFrontWave",
        (0.012, r * 0.82, r * 0.48),
        scale_t=(1.38, 0.44, 0.86),
        rot_t=(-0.18, 0.08, -0.11),
        mat=mats["hair"],
        parent=head_root,
        subsurf=1,
    )
    add_Part_Three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=0.044, location=location),
        "Dealer_HairSideSweep",
        (-0.038, r * 0.75, r * 0.42),
        scale_t=(0.95, 0.36, 0.82),
        rot_t=(-0.15, -0.15, 0.22),
        mat=mats["hair"],
        parent=head_root,
    )

    return head_root


def build_dealer_torso(mats):
    """
    Builds the Master Croupier Torso, Satin Shawl-Lapel Waistcoat, Pleated Tuxedo Shirt,
    3D Silk Gold Bow Tie, Gold Buttons, Pocket Square, Nameplate, and Acrylic/Brass Dealing Shoe.
    Origin at (0,0,0) of dealerGroup.
    """
    torso_root = bpy.data.objects.new("Dealer_Torso", None)
    bpy.context.collection.objects.link(torso_root)
    torso_root.location = (0.0, 0.0, 0.0)

    # 1. Sculpted Anatomical Croupier Waistcoat (Vest) Body using BMesh + Subdivision
    mesh = bpy.data.meshes.new("Dealer_Waistcoat_Mesh")
    vest_obj = bpy.data.objects.new("Dealer_WaistcoatBody", mesh)
    bpy.context.collection.objects.link(vest_obj)

    bm = bmesh.new()
    segs = 40
    # Height rings in Three.js Y (from waist y=0.02 up to shoulders y=0.47)
    y_levels = [0.02, 0.08, 0.16, 0.25, 0.34, 0.41, 0.455, 0.48]
    rx_profile = [0.145, 0.142, 0.148, 0.158, 0.172, 0.188, 0.165, 0.075]
    rz_profile = [0.115, 0.114, 0.120, 0.132, 0.140, 0.132, 0.108, 0.068]

    rings = []
    for y_t, rx, rz in zip(y_levels, rx_profile, rz_profile):
        ring_v = []
        for s in range(segs):
            theta = (s / segs) * math.pi * 2.0
            xt = math.cos(theta) * rx
            zt = math.sin(theta) * rz

            # Subtle chest pectoral definition on front (+zt) around y=0.28..0.38
            if zt > 0.03 and 0.22 < y_t < 0.40:
                pec = math.sin(((y_t - 0.22) / 0.18) * math.pi) * (0.008 if abs(xt) > 0.025 else -0.003)
                zt += pec

            # Tailored waistcoat notched V-hem points at front bottom
            y_adj = y_t
            if y_t <= 0.08 and zt > 0.04:
                # Two tailored vest points at xt = ±0.045
                point_dip = max(0.0, 1.0 - abs(abs(xt) - 0.045) / 0.045)
                y_adj -= 0.022 * point_dip * (1.0 - (y_t - 0.02) / 0.06)

            bx, by, bz = t2b(xt, y_adj, zt)
            ring_v.append(bm.verts.new((bx, by, bz)))
        rings.append(ring_v)

    for r_idx in range(len(rings) - 1):
        for s in range(segs):
            nxt = (s + 1) % segs
            bm.faces.new((rings[r_idx][s], rings[r_idx][nxt], rings[r_idx + 1][nxt], rings[r_idx + 1][s]))

    # Cap top and bottom
    bm.faces.new(rings[-1])
    bm.faces.new(list(reversed(rings[0])))

    bm.normal_update()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    for face in bm.faces:
        for loop in face.loops:
            v = loop.vert.co
            loop[uv_layer].uv = (v.x * 3.5 + 0.5, v.z * 3.5)

    bm.to_mesh(mesh)
    bm.free()
    finalize_part(vest_obj, mats["vest"], parent=torso_root, subsurf_levels=1, smooth=True)

    # 2. Broad Tailored Shoulder Caps (blending seamlessly into Left/Right Arms at ±0.175, 0.39, -0.01)
    for dir_x in (-1.0, 1.0):
        tag = "L" if dir_x < 0 else "R"
        add_Part_Three(
            lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=0.064, location=location),
            f"Dealer_ShoulderCap_{tag}",
            (dir_x * 0.148, 0.405, -0.008),
            scale_t=(1.18, 0.78, 0.96),
            mat=mats["vest"],
            parent=torso_root,
        )

    # 3. Crisp White Pleated Tuxedo Dress Shirt Chest Bib (V-opening) & Wing Collar
    add_Part_Three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=20, radius=0.095, location=location),
        "Dealer_ShirtBib",
        (0.0, 0.365, 0.088),
        scale_t=(0.74, 1.28, 0.62),
        rot_t=(-0.10, 0.0, 0.0),
        mat=mats["shirt"],
        parent=torso_root,
    )

    # Vertical Tuxedo Pleat Strips on Shirt Bib
    for p_idx in range(-2, 3):
        px = p_idx * 0.014
        add_Part_Three(
            lambda location: bpy.ops.mesh.primitive_cube_add(size=1.0, location=location),
            f"Dealer_ShirtPleat_{p_idx+2}",
            (px, 0.365, 0.136 - abs(px) * 0.12),
            scale_t=(0.004, 0.16, 0.008),
            rot_t=(-0.12, 0.0, 0.0),
            mat=mats["shirt"],
            parent=torso_root,
        )

    # High Formal White Wing Collar around Neck base (y=0.475)
    add_Part_Three(
        lambda location: bpy.ops.mesh.primitive_torus_add(
            major_radius=0.054, minor_radius=0.013, major_segments=28, minor_segments=14, location=location
        ),
        "Dealer_ShirtCollarRing",
        (0.0, 0.472, -0.004),
        scale_t=(0.96, 1.35, 1.04),
        rot_t=(0.08, 0.0, 0.0),
        mat=mats["shirt"],
        parent=torso_root,
    )

    # 4. Satin Shawl Lapels framing the Tuxedo Shirt V-Zone
    for dir_x in (-1.0, 1.0):
        tag = "L" if dir_x < 0 else "R"
        add_Part_Three(
            lambda location: bpy.ops.mesh.primitive_cube_add(size=1.0, location=location),
            f"Dealer_SatinLapel_{tag}",
            (dir_x * 0.048, 0.355, 0.128),
            scale_t=(0.028, 0.21, 0.018),
            rot_t=(-0.12, dir_x * 0.18, dir_x * -0.24),
            mat=mats["satin_lapel"],
            parent=torso_root,
            subsurf=1,
        )

    # 5. Sculpted 3D Silk Gold Butterfly Bow Tie (Center Knot + Double Wing Ribbons)
    add_Part_Three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=14, radius=0.012, location=location),
        "Dealer_BowTie_Knot",
        (0.0, 0.452, 0.138),
        scale_t=(0.88, 1.05, 0.78),
        mat=mats["gold"],
        parent=torso_root,
    )
    for dir_x in (-1.0, 1.0):
        tag = "L" if dir_x < 0 else "R"
        add_Part_Three(
            lambda location: bpy.ops.mesh.primitive_cone_add(
                vertices=20, radius1=0.022, radius2=0.006, depth=0.038, location=location
            ),
            f"Dealer_BowTie_Wing_{tag}",
            (dir_x * 0.022, 0.452, 0.136),
            scale_t=(1.0, 0.52, 1.0),
            rot_t=(0.0, dir_x * -0.12, dir_x * (math.pi / 2)),
            mat=mats["gold"],
            parent=torso_root,
            subsurf=1,
        )

    # 6. 4 Beveled Gold Waistcoat Buttons + 2 Tuxedo Shirt Studs
    for idx, y_btn in enumerate([0.395, 0.345]):
        add_Part_Three(
            lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=0.0055, location=location),
            f"Dealer_ShirtStud_{idx}",
            (0.0, y_btn, 0.143),
            scale_t=(1.0, 1.0, 0.55),
            mat=mats["gold"],
            parent=torso_root,
        )

    for idx, (y_btn, z_btn) in enumerate([(0.265, 0.138), (0.215, 0.135), (0.165, 0.130), (0.115, 0.124)]):
        add_Part_Three(
            lambda location: bpy.ops.mesh.primitive_cylinder_add(vertices=18, radius=0.0085, depth=0.006, location=location),
            f"Dealer_VestButton_{idx}",
            (0.0, y_btn, z_btn),
            rot_t=(math.pi / 2, 0.0, 0.0),
            mat=mats["gold"],
            parent=torso_root,
        )

    # 7. Left Breast Pocket + Silk Pocket Square + Gold "MONTE CARLO" Croupier Nameplate Badge
    add_Part_Three(
        lambda location: bpy.ops.mesh.primitive_cube_add(size=1.0, location=location),
        "Dealer_NameplateBadge",
        (-0.082, 0.335, 0.122),
        scale_t=(0.046, 0.014, 0.006),
        rot_t=(-0.08, -0.28, 0.0),
        mat=mats["gold"],
        parent=torso_root,
    )
    add_Part_Three(
        lambda location: bpy.ops.mesh.primitive_cube_add(size=1.0, location=location),
        "Dealer_PocketSquare",
        (0.084, 0.338, 0.122),
        scale_t=(0.036, 0.018, 0.006),
        rot_t=(-0.10, 0.28, -0.08),
        mat=mats["shirt"],
        parent=torso_root,
    )

    # 8. Luxury 6-Deck Acrylic & Brushed-Brass Dealing Shoe at (0.24, 0.06, 0.28)
    shoe_x, shoe_y, shoe_z = 0.24, 0.048, 0.28
    shoe_yaw = -0.35
    add_Part_Three(
        lambda location: bpy.ops.mesh.primitive_cube_add(size=1.0, location=location),
        "Dealer_DealingShoe_Base",
        (shoe_x, shoe_y - 0.022, shoe_z),
        scale_t=(0.115, 0.012, 0.175),
        rot_t=(0.0, shoe_yaw, 0.0),
        mat=mats["gold"],
        parent=torso_root,
    )
    add_Part_Three(
        lambda location: bpy.ops.mesh.primitive_cube_add(size=1.0, location=location),
        "Dealer_DealingShoe_Body",
        (shoe_x, shoe_y + 0.008, shoe_z),
        scale_t=(0.106, 0.056, 0.162),
        rot_t=(0.12, shoe_yaw, 0.0),
        mat=mats["shoe_acrylic"],
        parent=torso_root,
    )
    add_Part_Three(
        lambda location: bpy.ops.mesh.primitive_cube_add(size=1.0, location=location),
        "Dealer_DealingShoe_Cards",
        (shoe_x, shoe_y + 0.012, shoe_z + 0.008),
        scale_t=(0.088, 0.042, 0.115),
        rot_t=(0.18, shoe_yaw, 0.0),
        mat=mats["card_stack"],
        parent=torso_root,
    )
    add_Part_Three(
        lambda location: bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.014, depth=0.092, location=location),
        "Dealer_DealingShoe_BrassRoller",
        (shoe_x, shoe_y + 0.024, shoe_z - 0.038),
        rot_t=(0.0, shoe_yaw, math.pi / 2),
        mat=mats["gold"],
        parent=torso_root,
    )

    return torso_root


def build_dealer_arm(side, mats):
    """
    Builds an articulated Croupier Arm (Dress Shirt Sleeve, Black Silk Sleeve Garter Armband,
    French Cuff with Gold Cufflink, Luxury Watch on Left Wrist, and 5-Fingered Hand).
    Origin at (0,0,0) of dealerLeftArm / dealerRightArm shoulder pivot!
    """
    is_left = side == "L"
    dir_x = 1.0 if is_left else -1.0  # Inward X offset toward center (lHand is +0.02, rHand is -0.02)
    arm_root = bpy.data.objects.new(f"Dealer_{'Left' if is_left else 'Right'}Arm", None)
    bpy.context.collection.objects.link(arm_root)
    arm_root.location = (0.0, 0.0, 0.0)

    # 1. Upper Sleeve & Forearm Sleeve with natural elbow bend toward (dir_x*0.02, -0.22, 0.08)
    add_Part_Three(
        lambda location: bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.040, depth=0.135, location=location),
        f"Dealer_UpperSleeve_{side}",
        (dir_x * 0.004, -0.058, 0.010),
        scale_t=(0.96, 1.0, 1.04),
        rot_t=(0.14, 0.0, dir_x * -0.05),
        mat=mats["shirt"],
        parent=arm_root,
        subsurf=1,
    )
    # Elbow Joint Roundness
    add_Part_Three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=14, radius=0.039, location=location),
        f"Dealer_Elbow_{side}",
        (dir_x * 0.008, -0.115, 0.022),
        scale_t=(0.96, 0.92, 1.02),
        mat=mats["shirt"],
        parent=arm_root,
    )
    # Forearm Tapered Sleeve
    add_Part_Three(
        lambda location: bpy.ops.mesh.primitive_cone_add(
            vertices=24, radius1=0.038, radius2=0.031, depth=0.115, location=location
        ),
        f"Dealer_ForearmSleeve_{side}",
        (dir_x * 0.014, -0.158, 0.048),
        rot_t=(0.42, 0.0, dir_x * -0.08),
        mat=mats["shirt"],
        parent=arm_root,
        subsurf=1,
    )

    # 2. Traditional Monte Carlo Black Silk Croupier Sleeve Garter (Armband) + Gold Clasp
    add_Part_Three(
        lambda location: bpy.ops.mesh.primitive_torus_add(
            major_radius=0.0385, minor_radius=0.0055, major_segments=24, minor_segments=12, location=location
        ),
        f"Dealer_SleeveGarter_{side}",
        (dir_x * 0.007, -0.092, 0.018),
        scale_t=(0.98, 1.4, 1.02),
        rot_t=(0.18, 0.0, dir_x * -0.05),
        mat=mats["satin_lapel"],
        parent=arm_root,
    )
    add_Part_Three(
        lambda location: bpy.ops.mesh.primitive_cube_add(size=1.0, location=location),
        f"Dealer_GarterClasp_{side}",
        (dir_x * 0.007, -0.092, 0.058),
        scale_t=(0.012, 0.014, 0.006),
        rot_t=(0.18, 0.0, 0.0),
        mat=mats["gold"],
        parent=arm_root,
    )

    # 3. Crisp French Cuff & Gold Cufflink at Wrist (y = -0.195, z = 0.068)
    add_Part_Three(
        lambda location: bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.032, depth=0.028, location=location),
        f"Dealer_FrenchCuff_{side}",
        (dir_x * 0.018, -0.195, 0.068),
        rot_t=(0.45, 0.0, dir_x * -0.08),
        mat=mats["shirt"],
        parent=arm_root,
    )
    add_Part_Three(
        lambda location: bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.0055, depth=0.008, location=location),
        f"Dealer_Cufflink_{side}",
        (dir_x * -0.014, -0.195, 0.068),
        rot_t=(0.0, 0.0, math.pi / 2),
        mat=mats["gold"],
        parent=arm_root,
    )

    # Left Wrist Luxury Gold Chronograph Watch
    if is_left:
        add_Part_Three(
            lambda location: bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.030, depth=0.014, location=location),
            "Dealer_Wristwatch_Band",
            (dir_x * 0.019, -0.206, 0.074),
            rot_t=(0.45, 0.0, dir_x * -0.08),
            mat=mats["gold"],
            parent=arm_root,
        )

    # 4. Sculpted 5-Fingered Croupier Hand at (dir_x * 0.02, -0.22, 0.08)
    hand_x = dir_x * 0.020
    hand_y = -0.220
    hand_z = 0.082
    add_Part_Three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=16, radius=0.026, location=location),
        f"Dealer_HandPalm_{side}",
        (hand_x, hand_y, hand_z),
        scale_t=(0.92, 0.62, 1.15),
        rot_t=(0.35, 0.0, dir_x * -0.12),
        mat=mats["skin"],
        parent=arm_root,
    )

    # 4 Sculpted Fingers (Index, Middle, Ring, Pinky) + Opposable Thumb
    finger_offsets = [
        ("Index", dir_x * 0.014, 0.022, 0.0055),
        ("Middle", dir_x * 0.004, 0.025, 0.0056),
        ("Ring", dir_x * -0.006, 0.023, 0.0053),
        ("Pinky", dir_x * -0.015, 0.019, 0.0048),
    ]
    for f_name, fx_off, f_len, f_rad in finger_offsets:
        add_Part_Three(
            lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=10, radius=f_rad, location=location),
            f"Dealer_Finger_{f_name}_{side}",
            (hand_x + fx_off, hand_y - 0.008, hand_z + 0.024),
            scale_t=(1.0, 0.85, f_len / f_rad * 0.65),
            rot_t=(0.48, 0.0, 0.0),
            mat=mats["skin"],
            parent=arm_root,
        )

    # Thumb
    add_Part_Three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=10, radius=0.0065, location=location),
        f"Dealer_Thumb_{side}",
        (hand_x + dir_x * 0.022, hand_y - 0.004, hand_z + 0.010),
        scale_t=(1.1, 0.85, 2.1),
        rot_t=(0.25, dir_x * 0.45, 0.0),
        mat=mats["skin"],
        parent=arm_root,
    )

    return arm_root


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    clear_scene()

    mats = {
        "skin": create_pbr_material(
            "Dealer_Skin",
            (0.945, 0.835, 0.745),
            roughness=0.38,
            metallic=0.02,
            subsurface=0.15,
            clearcoat=0.08,
            clearcoat_roughness=0.35,
        ),
        "skin_nose": create_pbr_material(
            "Dealer_SkinContour",
            (0.895, 0.755, 0.655),
            roughness=0.35,
            metallic=0.02,
            subsurface=0.18,
        ),
        "hair": create_pbr_material(
            "Dealer_EspressoHair",
            (0.095, 0.075, 0.065),
            roughness=0.34,
            metallic=0.08,
            clearcoat=0.35,
            clearcoat_roughness=0.25,
            nor_tex="fabric_nor_1k.jpg",
            nor_strength=0.35,
        ),
        "sclera": create_pbr_material("Dealer_EyeSclera", (0.98, 0.99, 1.0), roughness=0.10, clearcoat=1.0),
        "iris": create_pbr_material("Dealer_EyeIris", (0.28, 0.16, 0.08), roughness=0.15, clearcoat=0.9),
        "pupil": create_pbr_material("Dealer_EyePupil", (0.02, 0.02, 0.03), roughness=0.08, clearcoat=1.0),
        "lip": create_pbr_material("Dealer_Lip", (0.62, 0.35, 0.29), roughness=0.36),
        "vest": create_pbr_material(
            "Dealer_ObsidianWaistcoat",
            (0.055, 0.085, 0.155),
            roughness=0.42,
            metallic=0.12,
            diff_tex="fabric_diff_1k.jpg",
            rough_tex="fabric_rough_1k.jpg",
            nor_tex="fabric_nor_1k.jpg",
            nor_strength=0.55,
            tint_color=(0.06, 0.09, 0.17),
        ),
        "satin_lapel": create_pbr_material(
            "Dealer_BlackSatin",
            (0.04, 0.05, 0.08),
            roughness=0.20,
            metallic=0.22,
            clearcoat=0.75,
            clearcoat_roughness=0.15,
        ),
        "shirt": create_pbr_material(
            "Dealer_CrispWhiteShirt",
            (0.97, 0.98, 0.99),
            roughness=0.44,
            metallic=0.02,
            nor_tex="fabric_nor_1k.jpg",
            nor_strength=0.22,
        ),
        "gold": create_pbr_material(
            "Dealer_MonteCarloGold",
            (0.95, 0.78, 0.22),
            roughness=0.18,
            metallic=0.92,
            clearcoat=0.5,
        ),
        "shoe_acrylic": create_pbr_material(
            "Dealer_SmokedAcrylicShoe",
            (0.08, 0.09, 0.12),
            roughness=0.12,
            metallic=0.35,
            clearcoat=0.95,
        ),
        "card_stack": create_pbr_material(
            "Dealer_CardDeckStack",
            (0.85, 0.14, 0.18),
            roughness=0.35,
            metallic=0.05,
        ),
    }

    build_dealer_torso(mats)
    build_dealer_head(mats)
    build_dealer_arm("L", mats)
    build_dealer_arm("R", mats)

    glb_path = os.path.join(OUT_DIR, "vip_dealer.glb")
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format="GLB",
        export_apply=True,
    )

    total_tris = sum(len(obj.data.polygons) * 2 for obj in bpy.data.objects if obj.type == "MESH")
    print(f"BLENDER_DEALER_EXPORT_SUCCESS: {glb_path} | Triangles: {total_tris}")


if __name__ == "__main__":
    main()
