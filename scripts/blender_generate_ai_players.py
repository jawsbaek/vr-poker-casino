"""
Headless Blender 5.2 High-Detail Character Generator
Monte Carlo Salon Prive — 4 AI Player Avatars (Viktor, Elena, Bao, Marcus)

Generates:
  public/models/vip_ai_players.glb

Articulated Hierarchy exported (16 root nodes matching CasinoScene.ts pivots 1:1):
  - Viktor_Torso, Viktor_Head, Viktor_LeftArm, Viktor_RightArm
  - Elena_Torso,  Elena_Head,  Elena_LeftArm,  Elena_RightArm
  - Bao_Torso,    Bao_Head,    Bao_LeftArm,    Bao_RightArm
  - Marcus_Torso, Marcus_Head, Marcus_LeftArm, Marcus_RightArm

Coordinate Mapping (Blender Z-up -> Three.js Y-up glTF 2.0):
  X_three =  X_blender
  Y_three =  Z_blender
  Z_three = -Y_blender  (so +Z_three forward toward table center is -Y_blender)

Run via:
  /Users/User/.local/bin/blender -b -P scripts/blender_generate_ai_players.py
"""

import bpy
import bmesh
import math
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
    rough_tex=None,
    nor_tex=None,
    nor_strength=0.5,
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


def add_part_three(prim_fn, name, loc_t, scale_t=(1, 1, 1), rot_t=(0, 0, 0), mat=None, parent=None, subsurf=0):
    """Creates a primitive in Three.js local coordinates (x_t, y_t, z_t) and converts to Blender space."""
    prim_fn(location=t2b(*loc_t))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (scale_t[0], scale_t[2], scale_t[1])
    obj.rotation_euler = r_t2b(*rot_t)
    return finalize_part(obj, mat, parent=parent, subsurf_levels=subsurf, smooth=True)


def build_sculpted_head_cranium(
    prefix,
    radius,
    mat_skin,
    parent,
    jaw_taper=0.25,
    cheek_prominence=0.06,
    brow_prominence=0.0055,
    width_scale=0.94,
    height_scale=1.06,
    full_cheeks=False,
):
    """
    Builds an organically sculpted human head & neck using BMesh vertex shaping + Subdivision Surface.
    Centered at (0,0,0) in <Role>_Head local space.
    """
    mesh = bpy.data.meshes.new(f"{prefix}_Cranium_Mesh")
    obj = bpy.data.objects.new(f"{prefix}_Cranium", mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=36, v_segments=28, radius=radius)

    for v in bm.verts:
        xt = v.co.x
        yt = v.co.z
        zt = -v.co.y

        xt *= width_scale
        yt *= height_scale

        # Taper lower jaw & chin (yt < 0)
        if yt < 0.0:
            jaw_t = min(1.0, abs(yt) / radius)
            xt *= (1.0 - jaw_taper * (jaw_t ** 1.35))
            if zt > 0:
                zt *= (1.0 + 0.075 * math.sin(jaw_t * math.pi))

        # Full rounded lower cheeks & submental contour for heavy-set Bao
        if full_cheeks and -0.055 < yt < 0.015 and zt > -0.01:
            cheek_puff = math.exp(-((yt + 0.022) ** 2) / 0.0007)
            xt *= (1.0 + 0.14 * cheek_puff)
            if zt > 0.02:
                zt += 0.008 * cheek_puff

        # Zygomatic cheekbone prominence
        if -0.024 < yt < 0.024 and zt > 0.02:
            cheek_factor = math.exp(-((yt - 0.002) ** 2) / 0.00038)
            xt *= (1.0 + cheek_prominence * cheek_factor)

        # Supraorbital brow ridge prominence
        if 0.016 < yt < 0.046 and zt > 0.045:
            brow_factor = math.exp(-((yt - 0.030) ** 2) / 0.00014)
            zt += brow_prominence * brow_factor

        # Eye socket recession
        eye_x = radius * 0.34
        eye_y = radius * 0.12
        for dir_x in (-1.0, 1.0):
            dist_eye = math.hypot(xt - dir_x * eye_x, yt - eye_y)
            if dist_eye < 0.023 and zt > 0.045:
                socket_depth = math.cos((dist_eye / 0.023) * (math.pi / 2))
                zt -= 0.0062 * socket_depth

        v.co.x = xt
        v.co.y = -zt
        v.co.z = yt

    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()

    finalize_part(obj, mat_skin, parent=parent, subsurf_levels=1, smooth=True)

    # Sculpted Neck with Sternocleidomastoid taper
    neck_r = 0.054 if full_cheeks else (0.037 if jaw_taper > 0.30 else 0.044)
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=neck_r, depth=0.145, location=location),
        f"{prefix}_Neck",
        (0.0, -radius * 0.88, -0.006),
        scale_t=(0.95, 1.0, 1.02),
        mat=mat_skin,
        parent=parent,
    )


def build_common_facial_anatomy(
    prefix,
    r,
    head_root,
    mat_skin_contour,
    mat_sclera,
    mat_iris,
    mat_pupil,
    mat_lip,
    mat_hair,
    eyelid_droop=0.14,
    brow_tilt=0.0,
    is_female=False,
    smirk=0.0,
):
    """Adds sculpted 3D nose bridge, tip, nostrils, ears, layered eyes, eyelids, eyebrows, and lips."""
    # 1. Sculpted 3D Nose (Bridge + Tip + Nostril Alae)
    nose_w = 0.64 if is_female else (0.86 if r > 0.10 else 0.72)
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=14, radius=0.0115, location=location),
        f"{prefix}_NoseBridge",
        (0.0, 0.006, r * 0.965),
        scale_t=(nose_w, 1.62, 0.94),
        rot_t=(-0.19, 0.0, 0.0),
        mat=mat_skin_contour,
        parent=head_root,
    )
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=14, radius=0.0108, location=location),
        f"{prefix}_NoseTip",
        (0.0, -0.005, r * 1.02),
        scale_t=(nose_w * 1.25, 0.76, 0.92),
        mat=mat_skin_contour,
        parent=head_root,
    )
    for dir_x in (-1.0, 1.0):
        tag = "L" if dir_x < 0 else "R"
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=0.0070, location=location),
            f"{prefix}_NostrilWing_{tag}",
            (dir_x * (0.0076 if is_female else 0.0092), -0.009, r * 0.985),
            scale_t=(0.95, 0.72, 0.85),
            mat=mat_skin_contour,
            parent=head_root,
        )

    # 2. Sculpted Ears
    for dir_x in (-1.0, 1.0):
        tag = "L" if dir_x < 0 else "R"
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=14, radius=0.020, location=location),
            f"{prefix}_Ear_{tag}",
            (dir_x * (r * 0.91 if not is_female else r * 0.86), -0.006, -0.008),
            scale_t=(0.36, 0.92, 0.60),
            rot_t=(-0.1, dir_x * -0.18, dir_x * -0.08),
            mat=mat_skin_contour,
            parent=head_root,
        )

    # 3. Layered Eyes (Sclera, Iris, Pupil, Upper Eyelid, Eyebrow)
    eye_x = r * 0.34
    eye_y = r * 0.12
    eye_z = r * 0.885
    for dir_x in (-1.0, 1.0):
        tag = "L" if dir_x < 0 else "R"
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=16, radius=0.0142, location=location),
            f"{prefix}_Sclera_{tag}",
            (dir_x * eye_x, eye_y, eye_z),
            scale_t=(1.16, 0.84, 0.55),
            rot_t=(0.0, dir_x * 0.15, 0.0),
            mat=mat_sclera,
            parent=head_root,
        )
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=14, radius=0.0084, location=location),
            f"{prefix}_Iris_{tag}",
            (dir_x * (eye_x + 0.001), eye_y, eye_z + 0.0066),
            scale_t=(1.0, 1.0, 0.40),
            rot_t=(0.0, dir_x * 0.15, 0.0),
            mat=mat_iris,
            parent=head_root,
        )
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=12, radius=0.0046, location=location),
            f"{prefix}_Pupil_{tag}",
            (dir_x * (eye_x + 0.0012), eye_y, eye_z + 0.0092),
            scale_t=(1.0, 1.0, 0.38),
            rot_t=(0.0, dir_x * 0.15, 0.0),
            mat=mat_pupil,
            parent=head_root,
        )
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_torus_add(
                major_radius=0.0132, minor_radius=0.0026, major_segments=20, minor_segments=10, location=location
            ),
            f"{prefix}_UpperEyelid_{tag}",
            (dir_x * eye_x, eye_y + 0.0042, eye_z + 0.003),
            scale_t=(1.15, 0.55, 0.65),
            rot_t=(1.28 + eyelid_droop, dir_x * 0.14, dir_x * -0.06),
            mat=mat_skin_contour,
            parent=head_root,
        )
        if is_female:
            # Curled dark upper eyelashes
            add_part_three(
                lambda location: bpy.ops.mesh.primitive_torus_add(
                    major_radius=0.0138, minor_radius=0.0016, major_segments=20, minor_segments=8, location=location
                ),
                f"{prefix}_Eyelash_{tag}",
                (dir_x * (eye_x + 0.001), eye_y + 0.0052, eye_z + 0.0055),
                scale_t=(1.18, 0.48, 0.62),
                rot_t=(1.18, dir_x * 0.14, dir_x * -0.10),
                mat=mat_pupil,
                parent=head_root,
            )

        # Sculpted Eyebrows
        brow_r = 0.0125 if is_female else 0.0148
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=12, radius=brow_r, location=location),
            f"{prefix}_Eyebrow_{tag}",
            (dir_x * eye_x, eye_y + 0.021, eye_z + 0.005),
            scale_t=(1.25, 0.24 if is_female else 0.29, 0.36),
            rot_t=(0.0, dir_x * 0.16, dir_x * brow_tilt),
            mat=mat_hair,
            parent=head_root,
        )

    # 4. Sculpted Upper & Lower Lips
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=12, radius=0.0125, location=location),
        f"{prefix}_UpperLip",
        (0.0, -r * 0.30, r * 0.955),
        scale_t=(1.22 if is_female else 1.15, 0.32 if is_female else 0.25, 0.54),
        rot_t=(0.0, 0.0, smirk),
        mat=mat_lip,
        parent=head_root,
    )
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=12, radius=0.0120, location=location),
        f"{prefix}_LowerLip",
        (0.0, -r * 0.355, r * 0.945),
        scale_t=(1.14 if is_female else 1.10, 0.35 if is_female else 0.28, 0.55),
        rot_t=(0.0, 0.0, smirk),
        mat=mat_lip,
        parent=head_root,
    )


def build_tailored_torso_shell(
    prefix,
    mat_body,
    parent,
    scale_x=1.0,
    scale_y=1.0,
    scale_z=1.0,
    v_neck_cut=False,
):
    """
    Builds a BMesh-sculpted + Subdivision anatomical torso shell from waist (y=0.01) to shoulders (y=0.43).
    """
    mesh = bpy.data.meshes.new(f"{prefix}_TorsoShell_Mesh")
    obj = bpy.data.objects.new(f"{prefix}_TorsoShell", mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()
    segs = 36
    y_levels = [0.01, 0.07, 0.14, 0.22, 0.30, 0.365, 0.41, 0.435]
    rx_profile = [0.125, 0.122, 0.128, 0.138, 0.150, 0.162, 0.142, 0.068]
    rz_profile = [0.102, 0.100, 0.106, 0.116, 0.124, 0.118, 0.096, 0.062]

    rings = []
    for y_t, rx, rz in zip(y_levels, rx_profile, rz_profile):
        ring_v = []
        for s in range(segs):
            theta = (s / segs) * math.pi * 2.0
            xt = math.cos(theta) * rx * scale_x
            zt = math.sin(theta) * rz * scale_z
            yt = y_t * scale_y

            # Subtle chest contour
            if zt > 0.025 and 0.20 < y_t < 0.36:
                pec = math.sin(((y_t - 0.20) / 0.16) * math.pi) * (0.008 if abs(xt) > 0.02 else -0.002)
                zt += pec

            bx, by, bz = t2b(xt, yt, zt)
            ring_v.append(bm.verts.new((bx, by, bz)))
        rings.append(ring_v)

    for r_idx in range(len(rings) - 1):
        for s in range(segs):
            nxt = (s + 1) % segs
            bm.faces.new((rings[r_idx][s], rings[r_idx][nxt], rings[r_idx + 1][nxt], rings[r_idx + 1][s]))

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
    finalize_part(obj, mat_body, parent=parent, subsurf_levels=1, smooth=True)


def build_hair_cap_mesh(prefix, r, mat_hair, parent, cut_z=0.018, cut_y=0.050, back_low=-0.052):
    mesh_hair = bpy.data.meshes.new(f"{prefix}_HairCap_Mesh")
    obj_hair = bpy.data.objects.new(f"{prefix}_HairCap", mesh_hair)
    bpy.context.collection.objects.link(obj_hair)
    bm_h = bmesh.new()
    bmesh.ops.create_uvsphere(bm_h, u_segments=34, v_segments=26, radius=r * 1.045)
    to_del = []
    for v in bm_h.verts:
        xt = v.co.x
        yt = v.co.z
        zt = -v.co.y
        if (zt > cut_z and yt < cut_y) or yt < back_low:
            to_del.append(v)
        else:
            xt *= 0.96
            yt *= 1.07
            v.co.x = xt
            v.co.y = -zt
            v.co.z = yt
    bmesh.ops.delete(bm_h, geom=to_del, context="VERTS")
    bm_h.normal_update()
    bm_h.to_mesh(mesh_hair)
    bm_h.free()
    finalize_part(obj_hair, mat_hair, parent=parent, subsurf_levels=1, smooth=True)


def build_articulated_arm(
    prefix,
    side,
    mat_sleeve,
    mat_skin,
    mat_cuff=None,
    mat_gold=None,
    mat_accent=None,
    sleeve_radius=0.036,
    is_bare_arm=False,
    has_left_watch=False,
    has_right_bangle=False,
    has_right_ring=False,
):
    """
    Builds a single character's Left or Right Arm with origin at (0,0,0) shoulder pivot.
    Matches CasinoScene.ts arm reach to (dir_x * 0.02, -0.20, 0.07).
    """
    is_left = side == "L"
    dir_x = 1.0 if is_left else -1.0
    arm_root = bpy.data.objects.new(f"{prefix}_{'Left' if is_left else 'Right'}Arm", None)
    bpy.context.collection.objects.link(arm_root)
    arm_root.location = (0.0, 0.0, 0.0)

    arm_mat = mat_skin if is_bare_arm else mat_sleeve

    # 1. Upper Arm & Elbow & Forearm
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_cylinder_add(vertices=22, radius=sleeve_radius, depth=0.125, location=location),
        f"{prefix}_UpperArm_{side}",
        (dir_x * 0.004, -0.052, 0.009),
        scale_t=(0.95, 1.0, 1.02),
        rot_t=(0.15, 0.0, dir_x * -0.05),
        mat=arm_mat,
        parent=arm_root,
        subsurf=1,
    )
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=14, radius=sleeve_radius * 0.96, location=location),
        f"{prefix}_Elbow_{side}",
        (dir_x * 0.008, -0.105, 0.020),
        scale_t=(0.95, 0.92, 1.02),
        mat=arm_mat,
        parent=arm_root,
    )
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_cone_add(
            vertices=22, radius1=sleeve_radius * 0.94, radius2=sleeve_radius * 0.76, depth=0.105, location=location
        ),
        f"{prefix}_Forearm_{side}",
        (dir_x * 0.014, -0.145, 0.044),
        rot_t=(0.42, 0.0, dir_x * -0.07),
        mat=arm_mat,
        parent=arm_root,
        subsurf=1,
    )

    # 2. Dress Cuff / Ribbed Cuff
    if not is_bare_arm and mat_cuff:
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_cylinder_add(
                vertices=20, radius=sleeve_radius * 0.78, depth=0.024, location=location
            ),
            f"{prefix}_Cuff_{side}",
            (dir_x * 0.017, -0.178, 0.062),
            rot_t=(0.45, 0.0, dir_x * -0.07),
            mat=mat_cuff,
            parent=arm_root,
        )

    # 3. Luxury Gold Chronograph Watch on Left Wrist (Viktor & Marcus)
    if is_left and has_left_watch and mat_gold:
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.029, depth=0.015, location=location),
            f"{prefix}_WatchBand",
            (dir_x * 0.018, -0.184, 0.066),
            rot_t=(0.45, 0.0, dir_x * -0.07),
            mat=mat_gold,
            parent=arm_root,
        )
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.016, depth=0.008, location=location),
            f"{prefix}_WatchDial",
            (dir_x * 0.018, -0.180, 0.088),
            rot_t=(math.pi / 2 + 0.45, 0.0, 0.0),
            mat=mat_accent if mat_accent else mat_gold,
            parent=arm_root,
        )

    # 4. Gold Bangle Bracelet on Right Wrist (Elena)
    if (not is_left) and has_right_bangle and mat_gold:
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_torus_add(
                major_radius=0.024, minor_radius=0.0038, major_segments=22, minor_segments=10, location=location
            ),
            f"{prefix}_GoldBangle_R",
            (dir_x * 0.017, -0.176, 0.060),
            rot_t=(0.45, 0.0, dir_x * -0.07),
            mat=mat_gold,
            parent=arm_root,
        )

    # 5. Sculpted 5-Fingered Hand at (dir_x * 0.02, -0.20, 0.072)
    hand_x = dir_x * 0.020
    hand_y = -0.200
    hand_z = 0.074
    hand_scale = 0.88 if is_bare_arm else (1.12 if sleeve_radius > 0.04 else 0.96)
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=18, ring_count=14, radius=0.024 * hand_scale, location=location
        ),
        f"{prefix}_HandPalm_{side}",
        (hand_x, hand_y, hand_z),
        scale_t=(0.92, 0.62, 1.14),
        rot_t=(0.35, 0.0, dir_x * -0.12),
        mat=mat_skin,
        parent=arm_root,
    )

    finger_offsets = [
        ("Index", dir_x * 0.013 * hand_scale, 0.021 * hand_scale, 0.0050 * hand_scale),
        ("Middle", dir_x * 0.004 * hand_scale, 0.024 * hand_scale, 0.0052 * hand_scale),
        ("Ring", dir_x * -0.005 * hand_scale, 0.022 * hand_scale, 0.0049 * hand_scale),
        ("Pinky", dir_x * -0.014 * hand_scale, 0.018 * hand_scale, 0.0044 * hand_scale),
    ]
    for f_name, fx_off, f_len, f_rad in finger_offsets:
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=10, radius=f_rad, location=location),
            f"{prefix}_Finger_{f_name}_{side}",
            (hand_x + fx_off, hand_y - 0.007, hand_z + 0.022),
            scale_t=(1.0, 0.85, f_len / f_rad * 0.65),
            rot_t=(0.48, 0.0, 0.0),
            mat=mat_skin,
            parent=arm_root,
        )

    # Gold Signet Ring on Right Hand Ring Finger (Marcus)
    if (not is_left) and has_right_ring and mat_gold:
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_torus_add(
                major_radius=0.0056, minor_radius=0.0018, major_segments=14, minor_segments=8, location=location
            ),
            f"{prefix}_SignetRing_R",
            (hand_x - 0.005, hand_y - 0.004, hand_z + 0.016),
            rot_t=(0.48, 0.0, 0.0),
            mat=mat_gold,
            parent=arm_root,
        )

    # Opposable Thumb
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(
            segments=12, ring_count=10, radius=0.0060 * hand_scale, location=location
        ),
        f"{prefix}_Thumb_{side}",
        (hand_x + dir_x * 0.020 * hand_scale, hand_y - 0.004, hand_z + 0.009),
        scale_t=(1.1, 0.85, 2.0),
        rot_t=(0.25, dir_x * 0.45, 0.0),
        mat=mat_skin,
        parent=arm_root,
    )

    return arm_root


# ==============================================================================
# 1. SEAT #1: VIKTOR ("THE SHARK" — Eastern European High-Roller)
# ==============================================================================
def build_viktor(common_mats):
    skin = create_pbr_material("Viktor_Skin", (0.91, 0.71, 0.59), roughness=0.40, subsurface=0.15, clearcoat=0.08)
    skin_c = create_pbr_material("Viktor_SkinContour", (0.85, 0.64, 0.52), roughness=0.36, subsurface=0.18)
    hair = create_pbr_material("Viktor_CharcoalHair", (0.14, 0.15, 0.17), roughness=0.38, clearcoat=0.25, nor_tex="fabric_nor_1k.jpg", nor_strength=0.3)
    silver = create_pbr_material("Viktor_SilverTemple", (0.68, 0.72, 0.78), roughness=0.32, metallic=0.18)
    iris = create_pbr_material("Viktor_SteelBlueIris", (0.15, 0.39, 0.92), roughness=0.12, clearcoat=1.0)
    lip = create_pbr_material("Viktor_Lip", (0.55, 0.33, 0.26), roughness=0.38)
    suit = create_pbr_material(
        "Viktor_NavySuit",
        (0.09, 0.13, 0.22),
        roughness=0.44,
        metallic=0.14,
        rough_tex="fabric_rough_1k.jpg",
        nor_tex="fabric_nor_1k.jpg",
        nor_strength=0.55,
    )
    tie = create_pbr_material("Viktor_RoyalSilkTie", (0.11, 0.30, 0.85), roughness=0.24, metallic=0.25, clearcoat=0.6)

    # --- Viktor_Head ---
    head_root = bpy.data.objects.new("Viktor_Head", None)
    bpy.context.collection.objects.link(head_root)
    r = 0.095
    build_sculpted_head_cranium(
        "Viktor", r, skin, head_root, jaw_taper=0.22, cheek_prominence=0.075, brow_prominence=0.0070, width_scale=0.95, height_scale=1.07
    )
    build_common_facial_anatomy(
        "Viktor", r, head_root, skin_c, common_mats["sclera"], iris, common_mats["pupil"], lip, hair, eyelid_droop=0.22, brow_tilt=0.12
    )
    build_hair_cap_mesh("Viktor", r, hair, head_root)
    # Brushed-back Pompadour + Silver Fox Temple Streaks
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=26, ring_count=18, radius=0.054, location=location),
        "Viktor_Pompadour",
        (0.0, r * 0.84, r * 0.45),
        scale_t=(1.35, 0.44, 0.86),
        rot_t=(-0.15, 0.0, 0.0),
        mat=hair,
        parent=head_root,
        subsurf=1,
    )
    for dir_x in (-1.0, 1.0):
        tag = "L" if dir_x < 0 else "R"
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=14, radius=0.032, location=location),
            f"Viktor_SilverTemple_{tag}",
            (dir_x * (r * 0.90), r * 0.22, 0.012),
            scale_t=(0.26, 0.75, 0.88),
            mat=silver,
            parent=head_root,
        )

    # --- Viktor_Torso ---
    torso_root = bpy.data.objects.new("Viktor_Torso", None)
    bpy.context.collection.objects.link(torso_root)
    build_tailored_torso_shell("Viktor", suit, torso_root, scale_x=1.02, scale_y=1.0, scale_z=0.96)
    for dir_x in (-1.0, 1.0):
        tag = "L" if dir_x < 0 else "R"
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=22, ring_count=16, radius=0.058, location=location),
            f"Viktor_ShoulderCap_{tag}",
            (dir_x * 0.132, 0.37, -0.008),
            scale_t=(1.18, 0.76, 0.94),
            mat=suit,
            parent=torso_root,
        )
        # Sharp Satin Peak Lapels
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_cube_add(size=1.0, location=location),
            f"Viktor_PeakLapel_{tag}",
            (dir_x * 0.046, 0.33, 0.118),
            scale_t=(0.030, 0.19, 0.016),
            rot_t=(-0.12, dir_x * 0.16, dir_x * -0.22),
            mat=common_mats["satin"],
            parent=torso_root,
            subsurf=1,
        )
    # Crisp White Shirt Bib & Collar
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=0.082, location=location),
        "Viktor_ShirtBib",
        (0.0, 0.34, 0.078),
        scale_t=(0.72, 1.24, 0.60),
        rot_t=(-0.10, 0.0, 0.0),
        mat=common_mats["shirt"],
        parent=torso_root,
    )
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_torus_add(major_radius=0.048, minor_radius=0.011, major_segments=26, minor_segments=12, location=location),
        "Viktor_Collar",
        (0.0, 0.435, -0.004),
        scale_t=(0.96, 1.28, 1.04),
        rot_t=(0.08, 0.0, 0.0),
        mat=common_mats["shirt"],
        parent=torso_root,
    )
    # Royal Blue Silk Tie + Gold Tie Bar + Pocket Square
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=12, radius=0.013, location=location),
        "Viktor_TieKnot",
        (0.0, 0.415, 0.122),
        scale_t=(0.95, 1.1, 0.78),
        mat=tie,
        parent=torso_root,
    )
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_cube_add(size=1.0, location=location),
        "Viktor_TieBlade",
        (0.0, 0.325, 0.126),
        scale_t=(0.022, 0.155, 0.010),
        rot_t=(-0.11, 0.0, 0.0),
        mat=tie,
        parent=torso_root,
        subsurf=1,
    )
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_cube_add(size=1.0, location=location),
        "Viktor_GoldTieBar",
        (0.0, 0.345, 0.132),
        scale_t=(0.024, 0.004, 0.006),
        rot_t=(-0.11, 0.0, 0.0),
        mat=common_mats["gold"],
        parent=torso_root,
    )
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_cube_add(size=1.0, location=location),
        "Viktor_PocketSquare",
        (0.076, 0.335, 0.114),
        scale_t=(0.034, 0.016, 0.008),
        rot_t=(-0.12, 0.22, -0.10),
        mat=common_mats["gold"],
        parent=torso_root,
    )

    left_arm = build_articulated_arm(
        "Viktor", "L", suit, skin, mat_cuff=common_mats["shirt"], mat_gold=common_mats["gold"], mat_accent=common_mats["satin"], has_left_watch=True
    )
    right_arm = build_articulated_arm(
        "Viktor", "R", suit, skin, mat_cuff=common_mats["shirt"], mat_gold=common_mats["gold"]
    )
    return [torso_root, head_root, left_arm, right_arm]


# ==============================================================================
# 2. SEAT #2: ELENA ("THE ROCK" — Monte Carlo Aristocrat)
# ==============================================================================
def build_elena(common_mats):
    skin = create_pbr_material("Elena_Skin", (0.95, 0.81, 0.71), roughness=0.36, subsurface=0.22, clearcoat=0.12)
    skin_c = create_pbr_material("Elena_SkinContour", (0.90, 0.74, 0.64), roughness=0.34, subsurface=0.22)
    hair = create_pbr_material("Elena_EspressoUpdo", (0.09, 0.07, 0.06), roughness=0.28, clearcoat=0.45, nor_tex="fabric_nor_1k.jpg", nor_strength=0.3)
    iris = create_pbr_material("Elena_AmberIris", (0.48, 0.18, 0.07), roughness=0.12, clearcoat=1.0)
    lip = create_pbr_material("Elena_CrimsonLip", (0.75, 0.07, 0.24), roughness=0.18, clearcoat=0.75)
    gown = create_pbr_material(
        "Elena_BurgundyVelvetGown",
        (0.48, 0.09, 0.11),
        roughness=0.52,
        metallic=0.12,
        rough_tex="fabric_rough_1k.jpg",
        nor_tex="fabric_nor_1k.jpg",
        nor_strength=0.60,
    )
    ruby = create_pbr_material("Elena_RubyGem", (0.88, 0.11, 0.28), roughness=0.08, metallic=0.35, clearcoat=1.0)

    # --- Elena_Head ---
    head_root = bpy.data.objects.new("Elena_Head", None)
    bpy.context.collection.objects.link(head_root)
    r = 0.095
    build_sculpted_head_cranium(
        "Elena", r, skin, head_root, jaw_taper=0.34, cheek_prominence=0.068, brow_prominence=0.0025, width_scale=0.91, height_scale=1.06
    )
    build_common_facial_anatomy(
        "Elena", r, head_root, skin_c, common_mats["sclera"], iris, common_mats["pupil"], lip, hair, eyelid_droop=0.10, brow_tilt=-0.06, is_female=True
    )
    build_hair_cap_mesh("Elena", r, hair, head_root)
    # Sleek Crown Sweep + Sculpted Chignon Updo Bun + Gold Hair Cuff
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=26, ring_count=18, radius=0.056, location=location),
        "Elena_HairCrown",
        (0.0, r * 0.80, r * 0.36),
        scale_t=(1.30, 0.42, 0.82),
        mat=hair,
        parent=head_root,
        subsurf=1,
    )
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=18, radius=0.056, location=location),
        "Elena_ChignonBun",
        (0.0, r * 1.02, -0.036),
        scale_t=(1.06, 0.88, 1.0),
        mat=hair,
        parent=head_root,
        subsurf=1,
    )
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_torus_add(major_radius=0.042, minor_radius=0.0055, major_segments=24, minor_segments=12, location=location),
        "Elena_GoldBunCuff",
        (0.0, r * 0.83, -0.028),
        rot_t=(math.pi / 2.2, 0.0, 0.0),
        mat=common_mats["gold"],
        parent=head_root,
    )
    # Ruby & Gold Drop Earrings
    for dir_x in (-1.0, 1.0):
        tag = "L" if dir_x < 0 else "R"
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=0.008, location=location),
            f"Elena_EarringStud_{tag}",
            (dir_x * (r * 0.92), -0.020, 0.008),
            mat=common_mats["gold"],
            parent=head_root,
        )
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_cone_add(vertices=14, radius1=0.0085, radius2=0.001, depth=0.024, location=location),
            f"Elena_EarringRubyDrop_{tag}",
            (dir_x * (r * 0.92), -0.038, 0.008),
            rot_t=(math.pi, 0.0, 0.0),
            mat=ruby,
            parent=head_root,
        )

    # --- Elena_Torso ---
    torso_root = bpy.data.objects.new("Elena_Torso", None)
    bpy.context.collection.objects.link(torso_root)
    # Evening Gown Bodice (up to y=0.33) + Bare Sculpted Décolletage & Shoulders above y=0.33
    build_tailored_torso_shell("Elena", gown, torso_root, scale_x=0.86, scale_y=0.84, scale_z=0.84)
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=20, radius=0.128, location=location),
        "Elena_DecolletageShoulders",
        (0.0, 0.365, -0.006),
        scale_t=(1.08, 0.56, 0.72),
        mat=skin,
        parent=torso_root,
        subsurf=1,
    )
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=26, ring_count=18, radius=0.126, location=location),
        "Elena_SweetheartGownBust",
        (0.0, 0.305, 0.012),
        scale_t=(1.02, 0.55, 0.86),
        mat=gown,
        parent=torso_root,
        subsurf=1,
    )
    # 18K Gold Necklace + Ruby Pendant on Décolletage
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_torus_add(major_radius=0.056, minor_radius=0.0045, major_segments=28, minor_segments=12, location=location),
        "Elena_GoldNecklace",
        (0.0, 0.425, 0.012),
        rot_t=(0.18, 0.0, 0.0),
        mat=common_mats["gold"],
        parent=torso_root,
    )
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.013, location=location),
        "Elena_RubyPendant",
        (0.0, 0.405, 0.072),
        scale_t=(0.85, 1.18, 0.55),
        mat=ruby,
        parent=torso_root,
    )

    left_arm = build_articulated_arm(
        "Elena", "L", gown, skin, sleeve_radius=0.028, is_bare_arm=True
    )
    right_arm = build_articulated_arm(
        "Elena", "R", gown, skin, mat_gold=common_mats["gold"], sleeve_radius=0.028, is_bare_arm=True, has_right_bangle=True
    )
    return [torso_root, head_root, left_arm, right_arm]


# ==============================================================================
# 3. SEAT #3: BAO ("CALLING STATION" — Heavy Phone-Watcher / Tech Whale)
# ==============================================================================
def build_bao(common_mats):
    skin = create_pbr_material("Bao_Skin", (0.90, 0.72, 0.53), roughness=0.42, subsurface=0.16, clearcoat=0.09)
    skin_c = create_pbr_material("Bao_SkinContour", (0.84, 0.65, 0.47), roughness=0.38, subsurface=0.18)
    hair = create_pbr_material("Bao_JetBlackHair", (0.06, 0.08, 0.12), roughness=0.40, nor_tex="fabric_nor_1k.jpg", nor_strength=0.3)
    iris = create_pbr_material("Bao_DarkEspressoIris", (0.12, 0.10, 0.09), roughness=0.12, clearcoat=1.0)
    lip = create_pbr_material("Bao_Lip", (0.56, 0.33, 0.26), roughness=0.38)
    bomber = create_pbr_material(
        "Bao_EmeraldVelvetBomber",
        (0.03, 0.28, 0.21),
        roughness=0.46,
        metallic=0.14,
        rough_tex="fabric_rough_1k.jpg",
        nor_tex="fabric_nor_1k.jpg",
        nor_strength=0.58,
    )
    tee = create_pbr_material("Bao_SlateCrewTee", (0.11, 0.15, 0.22), roughness=0.62, nor_tex="fabric_nor_1k.jpg", nor_strength=0.35)
    chrome = create_pbr_material("Bao_BrushedChrome", (0.78, 0.82, 0.88), roughness=0.20, metallic=0.90)
    glass_lens = create_pbr_material(
        "Bao_CyanScreenReflectLens",
        (0.75, 0.88, 0.96),
        roughness=0.06,
        metallic=0.18,
        clearcoat=1.0,
        alpha=0.38,
        emission_color=(0.14, 0.65, 0.92),
        emission_strength=0.35,
    )

    # --- Bao_Head ---
    head_root = bpy.data.objects.new("Bao_Head", None)
    bpy.context.collection.objects.link(head_root)
    r = 0.106
    build_sculpted_head_cranium(
        "Bao", r, skin, head_root, jaw_taper=0.12, cheek_prominence=0.085, brow_prominence=0.0045, width_scale=1.04, height_scale=1.05, full_cheeks=True
    )
    build_common_facial_anatomy(
        "Bao", r, head_root, skin_c, common_mats["sclera"], iris, common_mats["pupil"], lip, hair, eyelid_droop=0.16, brow_tilt=-0.04
    )
    build_hair_cap_mesh("Bao", r, hair, head_root, cut_z=0.022, cut_y=0.056)

    # Thick Rectangular Designer Eyeglasses with Cyan Screen-Glow Reflection Lenses
    eye_y = r * 0.12
    for dir_x in (-1.0, 1.0):
        tag = "L" if dir_x < 0 else "R"
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_cube_add(size=1.0, location=location),
            f"Bao_GlassFrameTop_{tag}",
            (dir_x * 0.037, eye_y + 0.012, r * 0.965),
            scale_t=(0.044, 0.0045, 0.006),
            mat=common_mats["satin"],
            parent=head_root,
        )
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_cube_add(size=1.0, location=location),
            f"Bao_GlassFrameBot_{tag}",
            (dir_x * 0.037, eye_y - 0.011, r * 0.965),
            scale_t=(0.044, 0.0038, 0.006),
            mat=common_mats["satin"],
            parent=head_root,
        )
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_cube_add(size=1.0, location=location),
            f"Bao_GlassFrameSide_{tag}",
            (dir_x * 0.057, eye_y, r * 0.965),
            scale_t=(0.0045, 0.025, 0.006),
            mat=common_mats["satin"],
            parent=head_root,
        )
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_cube_add(size=1.0, location=location),
            f"Bao_GlassTempleArm_{tag}",
            (dir_x * 0.092, eye_y + 0.004, r * 0.45),
            scale_t=(0.004, 0.005, 0.105),
            rot_t=(0.0, dir_x * -0.12, 0.0),
            mat=common_mats["satin"],
            parent=head_root,
        )
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_cube_add(size=1.0, location=location),
            f"Bao_GlassLens_{tag}",
            (dir_x * 0.037, eye_y, r * 0.968),
            scale_t=(0.039, 0.020, 0.002),
            mat=glass_lens,
            parent=head_root,
        )
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_cube_add(size=1.0, location=location),
        "Bao_GlassBridge",
        (0.0, eye_y + 0.005, r * 0.975),
        scale_t=(0.024, 0.0045, 0.006),
        mat=common_mats["satin"],
        parent=head_root,
    )

    # --- Bao_Torso ---
    torso_root = bpy.data.objects.new("Bao_Torso", None)
    bpy.context.collection.objects.link(torso_root)
    build_tailored_torso_shell("Bao", bomber, torso_root, scale_x=1.36, scale_y=1.05, scale_z=1.30)
    for dir_x in (-1.0, 1.0):
        tag = "L" if dir_x < 0 else "R"
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=22, ring_count=16, radius=0.068, location=location),
            f"Bao_ShoulderCap_{tag}",
            (dir_x * 0.168, 0.375, -0.008),
            scale_t=(1.24, 0.80, 1.02),
            mat=bomber,
            parent=torso_root,
        )
        # Dual Chrome Zipper Tracks
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_cube_add(size=1.0, location=location),
            f"Bao_ChromeZipper_{tag}",
            (dir_x * 0.056, 0.30, 0.162),
            scale_t=(0.010, 0.24, 0.012),
            rot_t=(-0.10, 0.0, dir_x * -0.05),
            mat=chrome,
            parent=torso_root,
        )
    # Center Crew-Neck Tee Panel & Ribbed Bomber Collar
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=0.098, location=location),
        "Bao_InnerCrewTee",
        (0.0, 0.315, 0.108),
        scale_t=(0.76, 1.28, 0.65),
        rot_t=(-0.09, 0.0, 0.0),
        mat=tee,
        parent=torso_root,
    )
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_torus_add(major_radius=0.060, minor_radius=0.013, major_segments=26, minor_segments=12, location=location),
        "Bao_BomberCollar",
        (0.0, 0.440, -0.004),
        scale_t=(1.04, 1.25, 1.06),
        rot_t=(0.08, 0.0, 0.0),
        mat=tee,
        parent=torso_root,
    )

    left_arm = build_articulated_arm(
        "Bao", "L", bomber, skin, mat_cuff=tee, sleeve_radius=0.044
    )
    right_arm = build_articulated_arm(
        "Bao", "R", bomber, skin, mat_cuff=tee, sleeve_radius=0.044
    )
    return [torso_root, head_root, left_arm, right_arm]


# ==============================================================================
# 4. SEAT #4: MARCUS ("THE ACTION MANIAC" — Flashy High-Roller)
# ==============================================================================
def build_marcus(common_mats):
    skin = create_pbr_material("Marcus_Skin", (0.85, 0.61, 0.40), roughness=0.40, subsurface=0.16, clearcoat=0.10)
    skin_c = create_pbr_material("Marcus_SkinContour", (0.79, 0.54, 0.34), roughness=0.36, subsurface=0.18)
    hair = create_pbr_material("Marcus_DarkBrownHair", (0.16, 0.11, 0.08), roughness=0.35, clearcoat=0.30, nor_tex="fabric_nor_1k.jpg", nor_strength=0.3)
    iris = create_pbr_material("Marcus_HazelIris", (0.47, 0.21, 0.06), roughness=0.12, clearcoat=1.0)
    lip = create_pbr_material("Marcus_Lip", (0.54, 0.29, 0.22), roughness=0.38)
    blazer = create_pbr_material(
        "Marcus_CognacBrocadeBlazer",
        (0.47, 0.21, 0.06),
        roughness=0.40,
        metallic=0.22,
        rough_tex="fabric_rough_1k.jpg",
        nor_tex="fabric_nor_1k.jpg",
        nor_strength=0.60,
    )
    aviator_lens = create_pbr_material(
        "Marcus_GoldAviatorLens",
        (0.28, 0.11, 0.02),
        roughness=0.05,
        metallic=0.45,
        clearcoat=1.0,
        alpha=0.78,
        emission_color=(0.45, 0.20, 0.04),
        emission_strength=0.18,
    )

    # --- Marcus_Head ---
    head_root = bpy.data.objects.new("Marcus_Head", None)
    bpy.context.collection.objects.link(head_root)
    r = 0.095
    build_sculpted_head_cranium(
        "Marcus", r, skin, head_root, jaw_taper=0.23, cheek_prominence=0.065, brow_prominence=0.0060, width_scale=0.95, height_scale=1.07
    )
    build_common_facial_anatomy(
        "Marcus", r, head_root, skin_c, common_mats["sclera"], iris, common_mats["pupil"], lip, hair, eyelid_droop=0.14, brow_tilt=-0.10, smirk=0.09
    )
    build_hair_cap_mesh("Marcus", r, hair, head_root)
    # Voluminous Styled Quiff + Groomed Chin Goatee
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=26, ring_count=18, radius=0.058, location=location),
        "Marcus_Quiff",
        (0.0, r * 0.90, r * 0.44),
        scale_t=(1.32, 0.54, 0.88),
        rot_t=(0.14, 0.0, 0.0),
        mat=hair,
        parent=head_root,
        subsurf=1,
    )
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=14, radius=0.024, location=location),
        "Marcus_Goatee",
        (0.0, -r * 0.58, r * 0.80),
        scale_t=(0.94, 0.78, 0.68),
        rot_t=(0.22, 0.0, 0.0),
        mat=hair,
        parent=head_root,
    )
    # Gold-Rimmed Teardrop Aviator Sunglasses (Double Nose Bridge + Amber Reflective Lenses)
    eye_y = r * 0.12
    for dir_x in (-1.0, 1.0):
        tag = "L" if dir_x < 0 else "R"
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_torus_add(major_radius=0.021, minor_radius=0.0028, major_segments=24, minor_segments=10, location=location),
            f"Marcus_AviatorBezel_{tag}",
            (dir_x * 0.036, eye_y, r * 0.965),
            scale_t=(1.18, 0.94, 1.0),
            rot_t=(math.pi / 2, dir_x * 0.10, 0.0),
            mat=common_mats["gold"],
            parent=head_root,
        )
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.020, depth=0.003, location=location),
            f"Marcus_AviatorLens_{tag}",
            (dir_x * 0.036, eye_y, r * 0.966),
            scale_t=(1.18, 1.0, 0.94),
            rot_t=(math.pi / 2, dir_x * 0.10, 0.0),
            mat=aviator_lens,
            parent=head_root,
        )
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_cube_add(size=1.0, location=location),
            f"Marcus_AviatorTemple_{tag}",
            (dir_x * 0.088, eye_y + 0.005, r * 0.44),
            scale_t=(0.003, 0.004, 0.102),
            rot_t=(0.0, dir_x * -0.10, 0.0),
            mat=common_mats["gold"],
            parent=head_root,
        )
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_cube_add(size=1.0, location=location),
        "Marcus_AviatorTopBar",
        (0.0, eye_y + 0.015, r * 0.975),
        scale_t=(0.038, 0.0035, 0.005),
        mat=common_mats["gold"],
        parent=head_root,
    )
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_cube_add(size=1.0, location=location),
        "Marcus_AviatorMidBar",
        (0.0, eye_y + 0.004, r * 0.975),
        scale_t=(0.024, 0.0030, 0.005),
        mat=common_mats["gold"],
        parent=head_root,
    )

    # --- Marcus_Torso ---
    torso_root = bpy.data.objects.new("Marcus_Torso", None)
    bpy.context.collection.objects.link(torso_root)
    build_tailored_torso_shell("Marcus", blazer, torso_root, scale_x=1.06, scale_y=1.02, scale_z=0.98)
    for dir_x in (-1.0, 1.0):
        tag = "L" if dir_x < 0 else "R"
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=22, ring_count=16, radius=0.060, location=location),
            f"Marcus_ShoulderCap_{tag}",
            (dir_x * 0.136, 0.375, -0.008),
            scale_t=(1.18, 0.78, 0.96),
            mat=blazer,
            parent=torso_root,
        )
        # Brushed Champagne Gold Contrast Lapels
        add_part_three(
            lambda location: bpy.ops.mesh.primitive_cube_add(size=1.0, location=location),
            f"Marcus_GoldLapel_{tag}",
            (dir_x * 0.050, 0.335, 0.122),
            scale_t=(0.030, 0.20, 0.016),
            rot_t=(-0.12, dir_x * 0.16, dir_x * -0.22),
            mat=common_mats["gold"],
            parent=torso_root,
            subsurf=1,
        )
    # Open-Collar Black Silk Shirt + Heavy 18K Gold Cuban Link Chain
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=0.084, location=location),
        "Marcus_BlackSilkShirt",
        (0.0, 0.335, 0.082),
        scale_t=(0.74, 1.25, 0.62),
        rot_t=(-0.10, 0.0, 0.0),
        mat=common_mats["satin"],
        parent=torso_root,
    )
    add_part_three(
        lambda location: bpy.ops.mesh.primitive_torus_add(major_radius=0.042, minor_radius=0.0055, major_segments=24, minor_segments=12, location=location),
        "Marcus_GoldCubanChain",
        (0.0, 0.405, 0.096),
        scale_t=(0.95, 1.15, 0.85),
        rot_t=(math.pi / 2.6, 0.0, 0.0),
        mat=common_mats["gold"],
        parent=torso_root,
    )

    left_arm = build_articulated_arm(
        "Marcus", "L", blazer, skin, mat_cuff=common_mats["satin"], mat_gold=common_mats["gold"], mat_accent=common_mats["satin"], has_left_watch=True
    )
    right_arm = build_articulated_arm(
        "Marcus", "R", blazer, skin, mat_cuff=common_mats["satin"], mat_gold=common_mats["gold"], has_right_ring=True
    )
    return [torso_root, head_root, left_arm, right_arm]


def join_children_into_single_mesh(root_empty, mesh_name):
    """Joins all child MESH objects under root_empty into 1 multi-material mesh with origin at (0,0,0)."""
    bpy.ops.object.select_all(action="DESELECT")
    children = [obj for obj in root_empty.children if obj.type == "MESH"]
    if not children:
        return
    for obj in children:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = children[0]
    if len(children) > 1:
        bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = mesh_name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    joined.select_set(False)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    clear_scene()

    common_mats = {
        "sclera": create_pbr_material("AI_EyeSclera", (0.98, 0.99, 1.0), roughness=0.08, clearcoat=1.0),
        "pupil": create_pbr_material("AI_EyePupil", (0.02, 0.02, 0.03), roughness=0.06, clearcoat=1.0),
        "shirt": create_pbr_material("AI_CrispWhiteShirt", (0.96, 0.97, 0.99), roughness=0.45, nor_tex="fabric_nor_1k.jpg", nor_strength=0.22),
        "satin": create_pbr_material("AI_ObsidianSatin", (0.04, 0.05, 0.09), roughness=0.20, metallic=0.25, clearcoat=0.75),
        "gold": create_pbr_material("AI_MonteCarloGold", (0.95, 0.78, 0.22), roughness=0.18, metallic=0.92, clearcoat=0.5),
    }

    all_roots = []
    all_roots.extend(build_viktor(common_mats))
    all_roots.extend(build_elena(common_mats))
    all_roots.extend(build_bao(common_mats))
    all_roots.extend(build_marcus(common_mats))

    for root_empty in all_roots:
        join_children_into_single_mesh(root_empty, f"{root_empty.name}_Mesh")

    glb_path = os.path.join(OUT_DIR, "vip_ai_players.glb")
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format="GLB",
        export_apply=True,
    )

    total_tris = sum(len(obj.data.polygons) * 2 for obj in bpy.data.objects if obj.type == "MESH")
    print(f"BLENDER_AI_PLAYERS_EXPORT_SUCCESS: {glb_path} | Roots: {len(all_roots)} | Triangles: {total_tris}")


if __name__ == "__main__":
    main()
