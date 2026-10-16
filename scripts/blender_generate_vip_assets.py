"""
Headless Blender 5.2 Photorealistic 3D Asset & Ergonomics Generator
Monte Carlo Salon Prive Poker Board & VIP Furniture Suite

Generates:
1. public/models/vip_poker_table.glb  (Standard glTF 2.0 PBR asset with Poly Haven CC0 textures)
2. public/models/vip_poker_table.usdz (Native Apple Vision Pro AR QuickLook 3D Diorama)
3. public/models/vision_pro_ergonomics_report.json (1:1 Meter Spatial Ergonomics Verification)

Run via:
  /Users/User/.local/bin/blender -b -P scripts/blender_generate_vip_assets.py
"""

import bpy
import bmesh
import math
import json
import os


PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PBR_DIR = os.path.join(PROJECT_ROOT, "public", "assets", "pbr")
OUT_DIR = os.path.join(PROJECT_ROOT, "public", "models")

# Aspect ratio matching CasinoScene.ts (rx : rz = 1.0 : 0.66)
ELLIPSE_ASPECT = 0.66


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


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
    transmission=0.0,
    alpha=1.0,
    emission_color=None,
    emission_strength=0.0,
    diff_tex=None,
    rough_tex=None,
    nor_tex=None,
    nor_strength=1.0,
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

    if transmission > 0.0:
        if "Transmission Weight" in bsdf.inputs:
            bsdf.inputs["Transmission Weight"].default_value = transmission
        elif "Transmission" in bsdf.inputs:
            bsdf.inputs["Transmission"].default_value = transmission

    if alpha < 1.0 and "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = alpha

    if emission_color and emission_strength > 0.0:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission_color, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
        elif "Emission" in bsdf.inputs:
            bsdf.inputs["Emission"].default_value = (*emission_color, 1.0)

    # Wire optional CC0 PBR image textures
    if diff_tex:
        img = load_image_safe(diff_tex, is_data=False)
        if img:
            tex_node = nodes.new("ShaderNodeTexImage")
            tex_node.image = img
            if tint_color:
                mix_node = nodes.new("ShaderNodeMix")
                mix_node.data_type = "RGBA"
                mix_node.blend_type = "MULTIPLY"
                mix_node.inputs[0].default_value = 0.88
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


def finalize_mesh_object(obj, mat, smooth=True, uv_scale=1.0):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if obj.data:
        obj.data.name = obj.name
    if smooth:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    if uv_scale != 1.0 and obj.data.uv_layers.active:
        uv_layer = obj.data.uv_layers.active.data
        for loop in uv_layer:
            loop.uv.x *= uv_scale
            loop.uv.y *= uv_scale
    if mat:
        if len(obj.data.materials) == 0:
            obj.data.materials.append(mat)
        else:
            obj.data.materials[0] = mat
    obj.select_set(False)



def create_elliptical_ring(name, rx_inner, rx_outer, z_bottom, z_top, segments=96, bevel_inner=0.004, mat=None, uv_scale=2.0):
    """Creates a beveled elliptical annular ring (e.g., Walnut Racetrack or Brass Inlay)."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()
    inner_bot = []
    outer_bot = []
    inner_top = []
    outer_top = []

    for i in range(segments):
        theta = (i / segments) * math.pi * 2.0
        cos_t = math.cos(theta)
        sin_t = math.sin(theta)

        ib = bm.verts.new((cos_t * rx_inner, sin_t * rx_inner * ELLIPSE_ASPECT, z_bottom))
        ob = bm.verts.new((cos_t * rx_outer, sin_t * rx_outer * ELLIPSE_ASPECT, z_bottom))
        it = bm.verts.new((cos_t * (rx_inner + bevel_inner), sin_t * (rx_inner + bevel_inner) * ELLIPSE_ASPECT, z_top))
        ot = bm.verts.new((cos_t * rx_outer, sin_t * rx_outer * ELLIPSE_ASPECT, z_top))

        inner_bot.append(ib)
        outer_bot.append(ob)
        inner_top.append(it)
        outer_top.append(ot)

    for i in range(segments):
        nxt = (i + 1) % segments
        # Top face
        bm.faces.new((inner_top[i], outer_top[i], outer_top[nxt], inner_top[nxt]))
        # Inner beveled step wall
        bm.faces.new((inner_bot[i], inner_top[i], inner_top[nxt], inner_bot[nxt]))
        # Outer wall
        bm.faces.new((outer_top[i], outer_bot[i], outer_bot[nxt], outer_top[nxt]))
        # Bottom face
        bm.faces.new((outer_bot[i], inner_bot[i], inner_bot[nxt], outer_bot[nxt]))

    bm.normal_update()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    for face in bm.faces:
        for loop in face.loops:
            v = loop.vert.co
            loop[uv_layer].uv = ((v.x / (rx_outer * 2.0) + 0.5) * uv_scale, (v.y / (rx_outer * 2.0) + 0.5) * uv_scale)

    bm.to_mesh(mesh)
    bm.free()
    finalize_mesh_object(obj, mat, smooth=True)
    return obj


def create_quilted_leather_bolster(name, major_rx, minor_r, z_center, mat_leather, mat_brass):
    """Creates a sculpted, quilted/tufted black leather bolster rail with 24 stitched seam channels & brass rivets."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()
    major_segs = 144  # Divisible by 24 tuft seams (every 6 segments)
    minor_segs = 24
    vert_scale_z = 0.52

    rings = []
    for i in range(major_segs):
        theta = (i / major_segs) * math.pi * 2.0
        cos_t = math.cos(theta)
        sin_t = math.sin(theta)

        # Subtle quilted seam indentation every 6th segment
        seam_phase = (i % 6)
        seam_dip = 0.945 if seam_phase == 0 else (0.985 if seam_phase in (1, 5) else 1.012)

        ring_verts = []
        for j in range(minor_segs):
            phi = (j / minor_segs) * math.pi * 2.0
            cos_p = math.cos(phi)
            sin_p = math.sin(phi)

            r_local = minor_r * seam_dip
            # Elliptical major path with normal radial offset
            px = (major_rx + r_local * cos_p) * cos_t
            py = (major_rx * ELLIPSE_ASPECT + r_local * cos_p) * sin_t
            pz = z_center + r_local * sin_p * vert_scale_z
            ring_verts.append(bm.verts.new((px, py, pz)))
        rings.append(ring_verts)

    for i in range(major_segs):
        nxt_i = (i + 1) % major_segs
        for j in range(minor_segs):
            nxt_j = (j + 1) % minor_segs
            bm.faces.new((rings[i][j], rings[nxt_i][j], rings[nxt_i][nxt_j], rings[i][nxt_j]))

    bm.normal_update()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    for i in range(major_segs):
        for j in range(minor_segs):
            v = rings[i][j]
            for loop in v.link_loops:
                loop[uv_layer].uv = ((i / major_segs) * 14.0, (j / minor_segs) * 2.5)

    bm.to_mesh(mesh)
    bm.free()
    finalize_mesh_object(obj, mat_leather, smooth=True)

    # Add 24 Brass Tuft Rivet Studs along the outer lower bolster trim
    stud_mesh = bpy.data.meshes.new("Table_BolsterBrassStuds")
    stud_obj = bpy.data.objects.new("Table_BolsterBrassStuds", stud_mesh)
    bpy.context.collection.objects.link(stud_obj)
    s_bm = bmesh.new()
    for s in range(24):
        theta = (s / 24.0) * math.pi * 2.0
        sx = (major_rx + minor_r * 0.92) * math.cos(theta)
        sy = (major_rx * ELLIPSE_ASPECT + minor_r * 0.92) * math.sin(theta)
        sz = z_center + 0.005
        bmesh.ops.create_uvsphere(
            s_bm,
            u_segments=10,
            v_segments=8,
            radius=0.0065,
            matrix=math_translation_matrix((sx, sy, sz)),
        )
    s_bm.to_mesh(stud_mesh)
    s_bm.free()
    finalize_mesh_object(stud_obj, mat_brass, smooth=True)
    return obj


def math_translation_matrix(loc):
    import mathutils
    return mathutils.Matrix.Translation(loc)


def create_hollow_cup_holder(name, x, y, z, mat_brass, mat_liner):
    """Creates a hollowed brushed-brass drop-in cup holder with rolled lip."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.046, depth=0.036, location=(x, y, z - 0.012))
    cup = bpy.context.active_object
    cup.name = name

    # Add rolled top brass lip torus
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.044, minor_radius=0.0045, major_segments=32, minor_segments=12, location=(x, y, z + 0.006)
    )
    lip = bpy.context.active_object
    lip.name = f"{name}_Lip"
    finalize_mesh_object(lip, mat_brass, smooth=True)
    finalize_mesh_object(cup, mat_brass, smooth=True)

    # Dark recessed inner well disc
    bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=0.039, depth=0.004, location=(x, y, z + 0.005))
    well = bpy.context.active_object
    well.name = f"{name}_Well"
    finalize_mesh_object(well, mat_liner, smooth=True)


def create_fluted_pedestal_base(mat_mahogany, mat_brass):
    """Creates Twin Fluted Mahogany Pedestal Columns, Arched Stretcher Beam, and Lion-Paw Brass Foot Rail."""
    for idx, px in enumerate([-0.52, 0.52]):
        # Stepped Plinth Base
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.34, depth=0.07, location=(px, 0.0, 0.035))
        plinth = bpy.context.active_object
        plinth.name = f"Table_PedestalPlinth_{idx}"
        plinth.scale = (1.12, 0.92, 1.0)
        finalize_mesh_object(plinth, mat_mahogany, smooth=True, uv_scale=1.5)

        # Brass Plinth Collar Ring
        bpy.ops.mesh.primitive_torus_add(
            major_radius=0.25, minor_radius=0.016, major_segments=32, minor_segments=12, location=(px, 0.0, 0.075)
        )
        collar = bpy.context.active_object
        collar.name = f"Table_PedestalBrassCollar_{idx}"
        finalize_mesh_object(collar, mat_brass, smooth=True)

        # Fluted Column Shaft (32 vertices with alternating radial fluting)
        mesh = bpy.data.meshes.new(f"Table_FlutedColumn_{idx}")
        col_obj = bpy.data.objects.new(f"Table_FlutedColumn_{idx}", mesh)
        bpy.context.collection.objects.link(col_obj)
        bm = bmesh.new()
        segs = 32
        rings_z = [0.07, 0.22, 0.42, 0.62, 0.70]
        radii = [0.23, 0.19, 0.175, 0.20, 0.26]
        ring_verts = []
        for rz, rad in zip(rings_z, radii):
            rv = []
            for s in range(segs):
                ang = (s / segs) * math.pi * 2.0
                flute = 0.93 if (s % 2 == 1 and 0.15 < rz < 0.65) else 1.0
                rv.append(bm.verts.new((px + math.cos(ang) * rad * flute, math.sin(ang) * rad * flute, rz)))
            ring_verts.append(rv)
        for r_i in range(len(rings_z) - 1):
            for s in range(segs):
                nxt = (s + 1) % segs
                bm.faces.new((ring_verts[r_i][s], ring_verts[r_i][nxt], ring_verts[r_i + 1][nxt], ring_verts[r_i + 1][s]))
        bm.normal_update()
        uv_layer = bm.loops.layers.uv.new("UVMap")
        for face in bm.faces:
            for loop in face.loops:
                v = loop.vert.co
                loop[uv_layer].uv = (v.x * 2.0, v.z * 2.0)
        bm.to_mesh(mesh)
        bm.free()
        finalize_mesh_object(col_obj, mat_mahogany, smooth=True)

    # Central Sculpted Mahogany Stretcher Beam linking the twin pedestals
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, 0.24))
    beam = bpy.context.active_object
    beam.name = "Table_PedestalStretcherBeam"
    beam.scale = (1.06, 0.16, 0.11)
    finalize_mesh_object(beam, mat_mahogany, smooth=True, uv_scale=2.0)

    # Heavy Oval Brushed-Brass Foot Rail + 6 Brass Support Brackets
    bpy.ops.mesh.primitive_torus_add(
        major_radius=1.08, minor_radius=0.022, major_segments=64, minor_segments=16, location=(0.0, 0.0, 0.12)
    )
    foot_rail = bpy.context.active_object
    foot_rail.name = "Table_BrassFootRail"
    foot_rail.scale = (1.0, ELLIPSE_ASPECT, 1.0)
    finalize_mesh_object(foot_rail, mat_brass, smooth=True)

    for b_idx in range(6):
        ang = (b_idx / 6.0) * math.pi * 2.0
        bx = math.cos(ang) * 0.88
        by = math.sin(ang) * 0.88 * ELLIPSE_ASPECT
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=14, radius=0.012, depth=0.32, location=(bx, by, 0.12), rotation=(math.pi / 2, 0, ang + math.pi / 2)
        )
        spoke = bpy.context.active_object
        spoke.name = f"Table_FootRailBracket_{b_idx}"
        finalize_mesh_object(spoke, mat_brass, smooth=True)


def create_dealer_chip_rack(mat_brass, mat_liner, chip_mats):
    """Creates a recessed brass-framed Dealer Chip Tray & Muck Card Slot at the Dealer position (Y=+0.74m -> Z_three=-0.74m)."""
    tray_y = 0.75
    tray_z = 0.764

    # Brass outer bezel
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, tray_y, tray_z))
    frame = bpy.context.active_object
    frame.name = "Dealer_ChipRack_Frame"
    frame.scale = (0.34, 0.11, 0.010)
    finalize_mesh_object(frame, mat_brass, smooth=True)

    # Dark velvet recessed tray bed
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, tray_y, tray_z + 0.002))
    bed = bpy.context.active_object
    bed.name = "Dealer_ChipRack_Bed"
    bed.scale = (0.315, 0.088, 0.008)
    finalize_mesh_object(bed, mat_liner, smooth=True)

    # 6 Brass Divider Ribs + Ornamental Bank Chip Rows in Dealer Tray
    denoms = [100, 100, 25, 25, 5, 1]
    for col in range(6):
        cx = (col - 2.5) * 0.048
        if col < 5:
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(cx + 0.024, tray_y, tray_z + 0.005))
            rib = bpy.context.active_object
            rib.name = f"Dealer_ChipRack_Rib_{col}"
            rib.scale = (0.003, 0.084, 0.008)
            finalize_mesh_object(rib, mat_brass, smooth=True)

        # Horizontal stacked chip cylinder inside trough
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=24, radius=0.019, depth=0.072, location=(cx, tray_y, tray_z + 0.008), rotation=(math.pi / 2, 0, 0)
        )
        chip_roll = bpy.context.active_object
        chip_roll.name = f"Dealer_TrayChips_{col}"
        finalize_mesh_object(chip_roll, chip_mats[denoms[col]], smooth=True)


def create_curved_wingback_shell(name, radius_inner, radius_outer, z_bot, z_top, world_mat, mat):
    """Creates a concave curved wingback backrest shell (-68 deg to +68 deg around local -Y) with vertical quilting."""
    import mathutils
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()
    arc_segs = 24
    z_segs = 6
    half_arc = math.radians(68.0)

    front_grid = []
    back_grid = []
    for iz in range(z_segs + 1):
        tz = iz / z_segs
        z = z_bot + tz * (z_top - z_bot)
        # Crown arch at top of wingback
        crown = math.cos((0.5) * math.pi) * 0.0
        tilt_y = -0.05 * tz  # Slight backward recline as backrest rises

        f_row = []
        b_row = []
        for ia in range(arc_segs + 1):
            ta = (ia / arc_segs) * 2.0 - 1.0  # -1 .. +1
            ang = -math.pi / 2.0 + ta * half_arc  # Centered around -Y (behind avatar)
            arch_z = z + (1.0 - ta * ta) * 0.045 * tz
            tuft = -0.005 * abs(math.sin(ia * math.pi * 0.5)) if radius_inner < radius_outer else 0.0

            fx = math.cos(ang) * (radius_inner + tuft)
            fy = math.sin(ang) * (radius_inner + tuft) + 0.04 + tilt_y
            bx = math.cos(ang) * radius_outer
            by = math.sin(ang) * radius_outer + 0.04 + tilt_y

            f_row.append(bm.verts.new((fx, fy, arch_z)))
            b_row.append(bm.verts.new((bx, by, arch_z)))
        front_grid.append(f_row)
        back_grid.append(b_row)

    for iz in range(z_segs):
        for ia in range(arc_segs):
            # Front concave face
            bm.faces.new((front_grid[iz][ia], front_grid[iz][ia + 1], front_grid[iz + 1][ia + 1], front_grid[iz + 1][ia]))
            # Back convex face
            bm.faces.new((back_grid[iz][ia + 1], back_grid[iz][ia], back_grid[iz + 1][ia], back_grid[iz + 1][ia + 1]))

    # Top and bottom rim caps
    for ia in range(arc_segs):
        bm.faces.new((front_grid[z_segs][ia], front_grid[z_segs][ia + 1], back_grid[z_segs][ia + 1], back_grid[z_segs][ia]))
        bm.faces.new((back_grid[0][ia], back_grid[0][ia + 1], front_grid[0][ia + 1], front_grid[0][ia]))

    # Left and right side wing caps
    for iz in range(z_segs):
        bm.faces.new((back_grid[iz][0], front_grid[iz][0], front_grid[iz + 1][0], back_grid[iz + 1][0]))
        bm.faces.new((front_grid[iz][arc_segs], back_grid[iz][arc_segs], back_grid[iz + 1][arc_segs], front_grid[iz + 1][arc_segs]))

    bm.normal_update()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    for face in bm.faces:
        for loop in face.loops:
            v = loop.vert.co
            loop[uv_layer].uv = (v.x * 2.5 + 0.5, v.z * 2.5)

    bm.to_mesh(mesh)
    bm.free()
    obj.matrix_world = world_mat
    finalize_mesh_object(obj, mat, smooth=True)
    return obj


def create_vip_armchairs(mat_leather, mat_mahogany, mat_brass):
    """Creates 4 Tufted Leather & Mahogany VIP Club Armchairs behind AI Seats 1..4."""
    ai_seats_three = [
        (1, 1.02, 0.32),
        (2, 0.72, -0.50),
        (3, -0.72, -0.50),
        (4, -1.02, 0.32),
    ]
    rx = 1.37
    rz = 1.37 * ELLIPSE_ASPECT

    for seat_idx, sx_t, sz_t in ai_seats_three:
        norm = 1.0 / math.hypot(sx_t / rx, sz_t / rz)
        # Avatar sits at norm * 1.22; place chair center at norm * 1.28 so concave backrest frames avatar cleanly
        chair_scale = norm * 1.28
        cx = sx_t * chair_scale
        cy = -sz_t * chair_scale  # Blender Y = -Three.js Z
        yaw = math.atan2(-cy, -cx) - math.pi / 2.0

        import mathutils
        rot_mat = mathutils.Matrix.Rotation(yaw, 4, "Z")
        trans_mat = mathutils.Matrix.Translation((cx, cy, 0.0))
        world_mat = trans_mat @ rot_mat

        def add_part(part_name, prim_fn, loc, scale, rot=(0, 0, 0), mat=mat_leather):
            prim_fn(location=(0, 0, 0))
            p = bpy.context.active_object
            p.name = f"VIP_Chair_Seat{seat_idx}_{part_name}"
            p.scale = scale
            p.rotation_euler = rot
            bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
            p.matrix_world = world_mat @ mathutils.Matrix.Translation(loc)
            finalize_mesh_object(p, mat, smooth=True)
            return p

        # 1. Cushioned Leather Seat Base (at Z=0.48m)
        add_part(
            "SeatCushion",
            lambda location: bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.25, depth=0.09, location=location),
            (0.0, 0.04, 0.48),
            (1.10, 1.04, 1.0),
            mat=mat_leather,
        )
        # Mahogany Seat Frame Apron
        add_part(
            "SeatFrame",
            lambda location: bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.26, depth=0.045, location=location),
            (0.0, 0.04, 0.425),
            (1.12, 1.06, 1.0),
            mat=mat_mahogany,
        )

        # 2. Concave Curved Tufted Wingback Backrest + Outer Mahogany Shell
        create_curved_wingback_shell(
            f"VIP_Chair_Seat{seat_idx}_Backrest",
            radius_inner=0.23,
            radius_outer=0.28,
            z_bot=0.49,
            z_top=1.01,
            world_mat=world_mat,
            mat=mat_leather,
        )
        create_curved_wingback_shell(
            f"VIP_Chair_Seat{seat_idx}_BackrestWoodTrim",
            radius_inner=0.28,
            radius_outer=0.305,
            z_bot=0.47,
            z_top=1.025,
            world_mat=world_mat,
            mat=mat_mahogany,
        )

        # Brass Rear Handle Bar on Backrest
        add_part(
            "BrassHandle",
            lambda location: bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.008, depth=0.18, location=location),
            (0.0, -0.32, 0.90),
            (1.0, 1.0, 1.0),
            rot=(0.0, math.pi / 2, 0.0),
            mat=mat_brass,
        )

        # 3. Left & Right Padded Armrests + Mahogany Supports
        for side_idx, sx_local in enumerate([-0.245, 0.245]):
            add_part(
                f"ArmrestPad_{side_idx}",
                lambda location: bpy.ops.mesh.primitive_cube_add(size=1.0, location=location),
                (sx_local, 0.0, 0.65),
                (0.065, 0.34, 0.045),
                mat=mat_leather,
            )
            add_part(
                f"ArmrestPost_{side_idx}",
                lambda location: bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.022, depth=0.16, location=location),
                (sx_local, 0.12, 0.56),
                (1.0, 1.0, 1.0),
                mat=mat_mahogany,
            )

        # 4. Four Tapered Mahogany Legs + Brass Foot Ferrules
        leg_coords = [(-0.19, 0.18), (0.19, 0.18), (-0.19, -0.18), (0.19, -0.18)]
        for l_idx, (lx, ly) in enumerate(leg_coords):
            add_part(
                f"Leg_{l_idx}",
                lambda location: bpy.ops.mesh.primitive_cone_add(
                    vertices=16, radius1=0.018, radius2=0.032, depth=0.42, location=location
                ),
                (lx, ly, 0.21),
                (1.0, 1.0, 1.0),
                mat=mat_mahogany,
            )
            add_part(
                f"LegBrassFerrule_{l_idx}",
                lambda location: bpy.ops.mesh.primitive_cylinder_add(
                    vertices=16, radius=0.019, depth=0.045, location=location
                ),
                (lx, ly, 0.022),
                (1.0, 1.0, 1.0),
                mat=mat_brass,
            )



def create_chandelier(mat_brass, mat_emerald_glass, mat_bulb):
    """Creates a 3-Lamp Emerald-Glass & Brushed-Brass Monte Carlo Billiard Chandelier at Z=2.68m..3.45m."""
    base_z = 2.68  # Safely above top_down camera (y=2.58m) so it never blocks top-down view!

    # Horizontal Brushed Brass Spine Bar
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=24, radius=0.018, depth=1.36, location=(0.0, 0.0, base_z + 0.18), rotation=(0, math.pi / 2, 0)
    )
    bar = bpy.context.active_object
    bar.name = "Salon_Chandelier_Bar"
    finalize_mesh_object(bar, mat_brass, smooth=True)

    # Central Ceiling Canopy & Twin Vertical Downrods
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.18, depth=0.04, location=(0.0, 0.0, 3.48))
    canopy = bpy.context.active_object
    canopy.name = "Salon_Chandelier_Canopy"
    finalize_mesh_object(canopy, mat_brass, smooth=True)

    for r_idx, rx_pos in enumerate([-0.42, 0.42]):
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.010, depth=0.64, location=(rx_pos, 0.0, base_z + 0.50))
        rod = bpy.context.active_object
        rod.name = f"Salon_Chandelier_Rod_{r_idx}"
        finalize_mesh_object(rod, mat_brass, smooth=True)

    # 3 Emerald Cased-Glass Banker/Billiard Lamp Shades + Brass Finials + Warm Glowing Bulbs
    for s_idx, sx in enumerate([-0.52, 0.0, 0.52]):
        bpy.ops.mesh.primitive_cone_add(
            vertices=36, radius1=0.23, radius2=0.065, depth=0.16, location=(sx, 0.0, base_z + 0.06)
        )
        shade = bpy.context.active_object
        shade.name = f"Salon_Chandelier_Shade_{s_idx}"
        finalize_mesh_object(shade, mat_emerald_glass, smooth=True)

        # Brass Bottom Rim Ring on Shade
        bpy.ops.mesh.primitive_torus_add(
            major_radius=0.23, minor_radius=0.006, major_segments=36, minor_segments=12, location=(sx, 0.0, base_z - 0.02)
        )
        rim = bpy.context.active_object
        rim.name = f"Salon_Chandelier_ShadeRim_{s_idx}"
        finalize_mesh_object(rim, mat_brass, smooth=True)

        # Warm Glowing Bulb
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=16, ring_count=12, radius=0.038, location=(sx, 0.0, base_z + 0.01)
        )
        bulb = bpy.context.active_object
        bulb.name = f"Salon_Chandelier_Bulb_{s_idx}"
        finalize_mesh_object(bulb, mat_bulb, smooth=True)


def create_stanchions_and_velvet_ropes(mat_brass, mat_velvet):
    """Creates 8 Ornate Brass Stanchions and Draped 3D Catenary Crimson Velvet Ropes around the VIP perimeter."""
    num_posts = 8
    rx = 2.75
    ry = 2.25
    post_tops = []

    for i in range(num_posts):
        ang = (i / num_posts) * math.pi * 2.0 + 0.38
        px = math.cos(ang) * rx
        py = math.sin(ang) * ry
        post_tops.append((px, py))

        # Domed Base
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.14, depth=0.03, location=(px, py, 0.015))
        base = bpy.context.active_object
        base.name = f"Salon_Stanchion_Base_{i}"
        finalize_mesh_object(base, mat_brass, smooth=True)

        # Turned Brass Post
        bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.024, depth=0.90, location=(px, py, 0.46))
        post = bpy.context.active_object
        post.name = f"Salon_Stanchion_Post_{i}"
        finalize_mesh_object(post, mat_brass, smooth=True)

        # Crown Finial Sphere
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=12, radius=0.044, location=(px, py, 0.94))
        finial = bpy.context.active_object
        finial.name = f"Salon_Stanchion_Finial_{i}"
        finalize_mesh_object(finial, mat_brass, smooth=True)

    # Connect posts with 3D Catenary Velvet Ropes (leave south entrance open between post 5 and 6)
    for i in range(num_posts):
        if i == 5:
            continue  # VIP Entrance Walkway
        p1 = post_tops[i]
        p2 = post_tops[(i + 1) % num_posts]

        curve_data = bpy.data.curves.new(f"Salon_VelvetRope_Curve_{i}", type="CURVE")
        curve_data.dimensions = "3D"
        curve_data.bevel_depth = 0.020
        curve_data.bevel_resolution = 6

        spline = curve_data.splines.new("POLY")
        steps = 20
        spline.points.add(steps)
        for s in range(steps + 1):
            t = s / steps
            x = p1[0] * (1.0 - t) + p2[0] * t
            y = p1[1] * (1.0 - t) + p2[1] * t
            # Parabolic catenary sag (drops 24cm at midpoint)
            sag = 4.0 * t * (1.0 - t) * 0.24
            z = 0.84 - sag
            spline.points[s].co = (x, y, z, 1.0)

        rope_obj = bpy.data.objects.new(f"Salon_VelvetRope_{i}", curve_data)
        bpy.context.collection.objects.link(rope_obj)
        bpy.context.view_layer.objects.active = rope_obj
        rope_obj.select_set(True)
        bpy.ops.object.convert(target="MESH")
        finalize_mesh_object(rope_obj, mat_velvet, smooth=True)


def create_dealer_credenza_bar(mat_mahogany, mat_brass, mat_glass, mat_amber):
    """Creates a Backlit Mahogany & Brass Credenza Sideboard with Crystal Whiskey Decanters behind the Dealer (Y=+3.45m)."""
    cy = 3.45  # Maps to Z_three = -3.45m (in front of Z=-3.85m mural wall)

    # Main Mahogany Credenza Cabinet Body
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, cy, 0.44))
    body = bpy.context.active_object
    body.name = "Salon_DealerCredenza_Body"
    body.scale = (2.55, 0.46, 0.86)
    finalize_mesh_object(body, mat_mahogany, smooth=True, uv_scale=2.0)

    # Overhanging Polished Marble/Mahogany Countertop + Brass Bullnose Trim
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, cy, 0.89))
    top = bpy.context.active_object
    top.name = "Salon_DealerCredenza_Top"
    top.scale = (2.64, 0.52, 0.045)
    finalize_mesh_object(top, mat_mahogany, smooth=True, uv_scale=2.0)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, cy - 0.262, 0.89))
    trim = bpy.context.active_object
    trim.name = "Salon_DealerCredenza_BrassTrim"
    trim.scale = (2.65, 0.012, 0.032)
    finalize_mesh_object(trim, mat_brass, smooth=True)

    # 4 Brass Framed Cabinet Door Panels on Front Face
    for d_idx in range(4):
        dx = (d_idx - 1.5) * 0.58
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(dx, cy - 0.235, 0.45))
        door = bpy.context.active_object
        door.name = f"Salon_DealerCredenza_Door_{d_idx}"
        door.scale = (0.50, 0.016, 0.66)
        finalize_mesh_object(door, mat_brass, smooth=True)

    # Crystal Liquor Decanters & Glasses on Top of Credenza
    decanter_xs = [-0.92, -0.74, 0.74, 0.92]
    for idx, dx in enumerate(decanter_xs):
        bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.052, depth=0.18, location=(dx, cy - 0.04, 1.00))
        dec = bpy.context.active_object
        dec.name = f"Salon_BarDecanter_{idx}"
        finalize_mesh_object(dec, mat_glass, smooth=True)

        bpy.ops.mesh.primitive_cylinder_add(vertices=18, radius=0.044, depth=0.11, location=(dx, cy - 0.04, 0.97))
        liq = bpy.context.active_object
        liq.name = f"Salon_BarDecanterLiquid_{idx}"
        finalize_mesh_object(liq, mat_amber, smooth=True)

        bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=0.028, location=(dx, cy - 0.04, 1.12))
        stopper = bpy.context.active_object
        stopper.name = f"Salon_BarDecanterStopper_{idx}"
        finalize_mesh_object(stopper, mat_brass, smooth=True)


def build_monte_carlo_salon():
    # 1. Author PBR Materials with Poly Haven CC0 Textures
    mat_felt = create_pbr_material(
        "EmeraldFelt",
        (0.039, 0.239, 0.141),
        roughness=0.82,
        metallic=0.02,
        diff_tex="fabric_diff_1k.jpg",
        rough_tex="fabric_rough_1k.jpg",
        nor_tex="fabric_nor_1k.jpg",
        nor_strength=0.65,
        tint_color=(0.05, 0.32, 0.18),
    )
    mat_racetrack = create_pbr_material(
        "WalnutRacetrack",
        (0.24, 0.11, 0.07),
        roughness=0.18,
        metallic=0.05,
        clearcoat=0.92,
        clearcoat_roughness=0.10,
        diff_tex="wood_diff_1k.jpg",
        rough_tex="wood_rough_1k.jpg",
        nor_tex="wood_nor_1k.jpg",
        nor_strength=0.55,
        tint_color=(0.55, 0.32, 0.22),
    )
    mat_mahogany = create_pbr_material(
        "DarkMahoganyWood",
        (0.16, 0.07, 0.05),
        roughness=0.26,
        metallic=0.06,
        clearcoat=0.75,
        clearcoat_roughness=0.16,
        diff_tex="wood_diff_1k.jpg",
        rough_tex="wood_rough_1k.jpg",
        nor_tex="wood_nor_1k.jpg",
        nor_strength=0.45,
        tint_color=(0.38, 0.20, 0.15),
    )
    mat_leather = create_pbr_material(
        "QuiltedBlackLeather",
        (0.07, 0.065, 0.08),
        roughness=0.46,
        metallic=0.06,
        clearcoat=0.25,
        clearcoat_roughness=0.35,
        diff_tex="leather_diff_1k.jpg",
        rough_tex="leather_rough_1k.jpg",
        nor_tex="leather_nor_1k.jpg",
        nor_strength=0.85,
        tint_color=(0.09, 0.08, 0.10),
    )
    mat_brass = create_pbr_material(
        "AntiqueBrass",
        (0.831, 0.686, 0.216),
        roughness=0.22,
        metallic=0.92,
        clearcoat=0.4,
    )
    mat_velvet = create_pbr_material(
        "CrimsonVelvetRope",
        (0.48, 0.05, 0.09),
        roughness=0.78,
        metallic=0.04,
        diff_tex="fabric_diff_1k.jpg",
        rough_tex="fabric_rough_1k.jpg",
        nor_tex="fabric_nor_1k.jpg",
        nor_strength=0.75,
        tint_color=(0.55, 0.06, 0.10),
    )
    mat_emerald_glass = create_pbr_material(
        "EmeraldGlassShade",
        (0.04, 0.38, 0.20),
        roughness=0.14,
        metallic=0.10,
        clearcoat=0.95,
        emission_color=(0.04, 0.35, 0.16),
        emission_strength=0.35,
    )
    mat_bulb = create_pbr_material(
        "WarmFilamentBulb",
        (1.0, 0.95, 0.80),
        roughness=0.1,
        emission_color=(1.0, 0.88, 0.58),
        emission_strength=4.5,
    )
    mat_liner = create_pbr_material("DarkVelvetLiner", (0.04, 0.04, 0.05), roughness=0.9, metallic=0.02)
    mat_glass = create_pbr_material(
        "CrystalDecanterGlass", (0.95, 0.97, 1.0), roughness=0.08, metallic=0.05, transmission=0.75, alpha=0.45
    )
    mat_amber = create_pbr_material(
        "AmberWhiskeyGlass",
        (0.85, 0.45, 0.05),
        roughness=0.15,
        metallic=0.08,
        emission_color=(0.75, 0.35, 0.02),
        emission_strength=0.25,
    )

    chip_mats = {
        1: create_pbr_material("Chip_1_White", (0.94, 0.95, 0.96), roughness=0.38, metallic=0.05),
        5: create_pbr_material("Chip_5_Red", (0.86, 0.15, 0.15), roughness=0.38, metallic=0.05),
        25: create_pbr_material("Chip_25_Emerald", (0.06, 0.72, 0.50), roughness=0.38, metallic=0.05),
        100: create_pbr_material("Chip_100_ObsidianGold", (0.10, 0.12, 0.16), roughness=0.28, metallic=0.35),
    }

    # 2. Recessed Center Emerald Wool-Baize Surface (rx=1.03m, ry=1.03*0.66m, top at Z=0.759m)
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=1.03, depth=0.038, location=(0.0, 0.0, 0.740))
    felt = bpy.context.active_object
    felt.name = "Table_EmeraldFelt"
    felt.scale = (1.0, ELLIPSE_ASPECT, 1.0)
    finalize_mesh_object(felt, mat_felt, smooth=True)
    # Apply uniform 1:1 meter planar UV projection on felt so 2D canvas markings align millimeter-accurately with Three.js
    if felt.data.uv_layers.active:
        uv_data = felt.data.uv_layers.active.data
        for poly in felt.data.polygons:
            for loop_idx in poly.loop_indices:
                v_co = felt.data.vertices[felt.data.loops[loop_idx].vertex_index].co
                uv_data[loop_idx].uv = (v_co.x / (2.0 * 1.03) + 0.5, v_co.y / (2.0 * 1.03) + 0.5)


    # 3. Outer Burled Walnut Racetrack (rx=1.015m..1.335m, top at Z=0.7615m -> 2.5mm step above felt)
    create_elliptical_ring(
        "Table_WalnutRacetrack",
        rx_inner=1.015,
        rx_outer=1.335,
        z_bottom=0.725,
        z_top=0.7615,
        segments=96,
        bevel_inner=0.005,
        mat=mat_racetrack,
        uv_scale=2.5,
    )

    # 4. Inlaid Brushed-Brass Divider Rings (Inner Racetrack Border & Outer Bolster Collar)
    create_elliptical_ring(
        "Table_BrassRacetrackInlay_Inner",
        rx_inner=1.008,
        rx_outer=1.020,
        z_bottom=0.758,
        z_top=0.762,
        segments=96,
        bevel_inner=0.001,
        mat=mat_brass,
    )
    create_elliptical_ring(
        "Table_BrassRacetrackInlay_Outer",
        rx_inner=1.288,
        rx_outer=1.298,
        z_bottom=0.758,
        z_top=0.7622,
        segments=96,
        bevel_inner=0.001,
        mat=mat_brass,
    )

    # 5. Under-Table Molded Mahogany Apron Skirt + Brass Trim Strip
    create_elliptical_ring(
        "Table_MahoganyApron",
        rx_inner=1.22,
        rx_outer=1.375,
        z_bottom=0.695,
        z_top=0.752,
        segments=96,
        bevel_inner=0.004,
        mat=mat_mahogany,
        uv_scale=2.5,
    )
    create_elliptical_ring(
        "Table_ApronBrassMolding",
        rx_inner=1.365,
        rx_outer=1.380,
        z_bottom=0.692,
        z_top=0.702,
        segments=96,
        bevel_inner=0.001,
        mat=mat_brass,
    )

    # 6. Quilted Black Leather Bolster Rail (rx=1.37m, ry=0.9042m, top=0.7994m)
    create_quilted_leather_bolster(
        "Table_QuiltedLeatherBolster",
        major_rx=1.37,
        minor_r=0.072,
        z_center=0.762,
        mat_leather=mat_leather,
        mat_brass=mat_brass,
    )

    # 7. 5 Hollowed Drop-In Brushed-Brass Cup Holders aligned with Three.js seats
    seat_positions_three = [
        (0.0, 0.68),
        (1.02, 0.32),
        (0.72, -0.50),
        (-0.72, -0.50),
        (-1.02, 0.32),
    ]
    for idx, (sx_t, sz_t) in enumerate(seat_positions_three):
        angle = math.atan2(sz_t, sx_t) + 0.26
        cup_x = math.cos(angle) * 1.185
        cup_y = -math.sin(angle) * 1.185 * ELLIPSE_ASPECT
        create_hollow_cup_holder(f"BrassCupHolder_Seat{idx}", cup_x, cup_y, 0.762, mat_brass, mat_liner)

    # 8. Recessed Dealer Chip Tray & Twin Fluted Mahogany Pedestal Base
    create_dealer_chip_rack(mat_brass, mat_liner, chip_mats)
    create_fluted_pedestal_base(mat_mahogany, mat_brass)

    # 9. Salon Prive Suite: 4 VIP Armchairs, 3-Lamp Chandelier, 8 Velvet Rope Stanchions, and Backlit Credenza Bar
    create_vip_armchairs(mat_leather, mat_mahogany, mat_brass)
    create_chandelier(mat_brass, mat_emerald_glass, mat_bulb)
    create_stanchions_and_velvet_ropes(mat_brass, mat_velvet)
    create_dealer_credenza_bar(mat_mahogany, mat_brass, mat_glass, mat_amber)

    # 10. Consolidate multi-part meshes by semantic group + material to keep WebGL draw calls ultra-low (~20 meshes)
    consolidate_salon_meshes()


def consolidate_salon_meshes():
    """Joins static sub-meshes that share a functional group and material into clean single-draw-call meshes."""
    buckets = {}
    for obj in list(bpy.data.objects):
        if obj.type != "MESH" or not obj.data.materials:
            continue
        name = obj.name
        mat_name = obj.data.materials[0].name

        # Keep primary hero table surfaces distinct
        if name in ("Table_EmeraldFelt", "Table_WalnutRacetrack", "Table_QuiltedLeatherBolster"):
            continue

        if name.startswith("VIP_Chair_"):
            key = f"Salon_VIPChairs_{mat_name}"
        elif name.startswith("Salon_Chandelier_"):
            key = f"Salon_Chandelier_{mat_name}"
        elif name.startswith("Salon_Stanchion_") or name.startswith("Salon_VelvetRope_"):
            key = f"Salon_Stanchions_{mat_name}"
        elif name.startswith("Salon_DealerCredenza_") or name.startswith("Salon_BarDecanter"):
            key = f"Salon_CredenzaBar_{mat_name}"
        else:
            key = f"Table_Group_{mat_name}"

        buckets.setdefault(key, []).append(obj)

    for group_name, objs in buckets.items():
        if len(objs) == 1:
            objs[0].name = group_name
            objs[0].data.name = group_name
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
        joined = bpy.context.active_object
        joined.name = group_name
        joined.data.name = group_name
        bpy.ops.object.select_all(action="DESELECT")



def compute_ergonomics_report():
    """Computes 1:1 meter spatial ergonomics metrics for Apple Vision Pro seated play."""
    eye_pos = (0.0, -1.32, 1.42)
    hole_cards_pos = (0.0, -0.68, 0.763)
    betting_ring_pos = (0.0, -0.43, 0.763)
    bank_chips_pos = (0.0, -0.79, 0.763)
    spatial_hud_pos = (0.0, -0.90, 0.835)

    def dist3d(a, b):
        return round(math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(3))), 3)

    def pitch_deg(eye, target):
        dy = target[1] - eye[1]
        dz = target[2] - eye[2]
        return round(math.degrees(math.atan2(dz, dy)), 1)

    total_tris = sum(len(obj.data.polygons) * 2 for obj in bpy.data.objects if obj.type == "MESH")

    return {
        "targetDevice": "Apple Vision Pro (visionOS Safari WebXR + AR QuickLook) & Desktop WebGL2",
        "pipeline": "Hybrid Headless Blender 5.2 LTS + Poly Haven CC0 PBR/HDRI",
        "unitScale": "1.0 unit = 1.0 meter (local-floor reference space)",
        "totalBlenderSceneTrianglesEstimate": total_tris,
        "seatedEyePositionMeters": {"x": 0.0, "y": 1.42, "z": 1.32},
        "tableFeltHeightMeters": 0.759,
        "walnutRacetrackHeightMeters": 0.7615,
        "quiltedBolsterTopHeightMeters": 0.7994,
        "ergonomicZones": {
            "bankChipStacksOnRacetrack": {
                "distanceFromEyesMeters": dist3d(eye_pos, bank_chips_pos),
                "gazePitchDegrees": pitch_deg(eye_pos, bank_chips_pos),
                "comfortRating": "Optimal Resting Arm / Gaze-Pinch Zone (< 0.85m)",
            },
            "holeCardsPeekZoneOnBaize": {
                "distanceFromEyesMeters": dist3d(eye_pos, hole_cards_pos),
                "gazePitchDegrees": pitch_deg(eye_pos, hole_cards_pos),
                "comfortRating": "Natural Downward Glance (-45.8 deg) for Secret Corner Peel",
            },
            "goldenBettingRing": {
                "distanceFromEyesMeters": dist3d(eye_pos, betting_ring_pos),
                "gazePitchDegrees": pitch_deg(eye_pos, betting_ring_pos),
                "comfortRating": "Comfortable Forward Chip Toss Target",
            },
            "spatialRimControlDock": {
                "distanceFromEyesMeters": dist3d(eye_pos, spatial_hud_pos),
                "gazePitchDegrees": pitch_deg(eye_pos, spatial_hud_pos),
                "comfortRating": "Ergonomic Rim Rest Above Quilted Bolster (y=0.835m > 0.800m)",
            },
        },
        "assetsExported": [
            "/models/vip_poker_table.glb",
            "/models/vip_poker_table.usdz",
        ],
    }


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    clear_scene()
    build_monte_carlo_salon()

    usdz_path = os.path.join(OUT_DIR, "vip_poker_table.usdz")
    glb_path = os.path.join(OUT_DIR, "vip_poker_table.glb")
    report_path = os.path.join(OUT_DIR, "vision_pro_ergonomics_report.json")

    # Export standard glTF 2.0 Binary (.glb)
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format="GLB",
        export_apply=True,
    )

    # Export native Apple Vision Pro USDZ for Safari AR QuickLook (<a rel="ar">)
    bpy.ops.wm.usd_export(
        filepath=usdz_path,
        selected_objects_only=False,
        export_materials=True,
    )

    report = compute_ergonomics_report()
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print("BLENDER_EXPORT_SUCCESS:", glb_path, usdz_path, "Triangles:", report["totalBlenderSceneTrianglesEstimate"])


if __name__ == "__main__":
    main()
