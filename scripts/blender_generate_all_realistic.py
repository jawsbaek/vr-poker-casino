import bpy
import bmesh
import math
import os
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

SCRATCH_DIR = "/Users/User/.gemini/antigravity/brain/b066b21e-03c2-4c92-b3fb-02f35779ebb2/scratch"
PROJECT_DIR = "/Users/User/Documents/3d poker"
OUT_DIR = "/Users/User/Documents/3d poker/public/models"
os.makedirs(OUT_DIR, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=f"{SCRATCH_DIR}/models/human_base_meshes_bundle.blend")

needed_base = {
    "GEO-body_male_realistic", "GEO-body_male_realistic.eye.L", "GEO-body_male_realistic.eye.R",
    "GEO-body_female_realistic", "GEO-body_female_realistic.eye.L", "GEO-body_female_realistic.eye.R",
    "GEO-head_animation_realistic", "GEO-head_animation_realistic.sclera.L", "GEO-head_animation_realistic.sclera.R",
    "GEO-head_sculpting_realistic", "GEO-head_sculpting_realistic.sclera.L", "GEO-head_sculpting_realistic.sclera.R",
}
for o in list(bpy.data.objects):
    if o.name not in needed_base:
        bpy.data.objects.remove(o, do_unlink=True)
    else:
        o.hide_render = False
        o.hide_viewport = False
        if o.name not in bpy.context.scene.collection.objects:
            bpy.context.scene.collection.objects.link(o)

roots = [
    ("GEO-body_male_realistic", ["GEO-body_male_realistic.eye.L", "GEO-body_male_realistic.eye.R"]),
    ("GEO-body_female_realistic", ["GEO-body_female_realistic.eye.L", "GEO-body_female_realistic.eye.R"]),
    ("GEO-head_animation_realistic", ["GEO-head_animation_realistic.sclera.L", "GEO-head_animation_realistic.sclera.R"]),
    ("GEO-head_sculpting_realistic", ["GEO-head_sculpting_realistic.sclera.L", "GEO-head_sculpting_realistic.sclera.R"]),
]
for rname, enames in roots:
    robj = bpy.data.objects[rname]
    robj.location = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for en in enames:
        bpy.data.objects[en].select_set(True)
    bpy.context.view_layer.objects.active = bpy.data.objects[enames[0]]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    robj.select_set(True)
    bpy.context.view_layer.objects.active = robj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def duplicate_pair(root_name, eye_l_name, eye_r_name, prefix):
    src_r = bpy.data.objects[root_name]
    src_el = bpy.data.objects[eye_l_name]
    src_er = bpy.data.objects[eye_r_name]
    nr = src_r.copy(); nr.data = src_r.data.copy(); nr.name = f"{prefix}_HeadBase"
    nel = src_el.copy(); nel.data = src_el.data.copy(); nel.name = f"{prefix}_EyeL"
    ner = src_er.copy(); ner.data = src_er.data.copy(); ner.name = f"{prefix}_EyeR"
    for o in [nr, nel, ner]:
        bpy.context.scene.collection.objects.link(o)
    return nr, nel, ner


def prepare_head_and_eyes(head_obj, eye_l, eye_r, scale, dy, dz, multires_level, trim_to_neck=True):
    bpy.context.view_layer.objects.active = head_obj
    for m in list(head_obj.modifiers):
        if m.type == 'MULTIRES':
            lvl = min(multires_level, m.total_levels)
            m.levels = lvl
            m.render_levels = lvl
            bpy.ops.object.modifier_apply(modifier=m.name)
        else:
            head_obj.modifiers.remove(m)
    if "sharp_face" in head_obj.data.attributes:
        head_obj.data.attributes.remove(head_obj.data.attributes["sharp_face"])
    for p in head_obj.data.polygons:
        p.use_smooth = True

    if trim_to_neck:
        is_full_body = len(head_obj.data.vertices) > 50000
        fs_attr = head_obj.data.attributes.get(".sculpt_face_set") if is_full_body else None
        vert_fs = {}
        if fs_attr:
            for pi, poly in enumerate(head_obj.data.polygons):
                val = fs_attr.data[pi].value
                for vi in poly.vertices:
                    if val in (3, 12, 106, 7, 8, 107):
                        vert_fs[vi] = val
                    elif vi not in vert_fs:
                        vert_fs[vi] = val
        bm = bmesh.new()
        bm.from_mesh(head_obj.data)
        to_del = []
        for v in bm.verts:
            co = v.co * scale + Vector((0.0, dy, dz))
            v.co = co
            fs = vert_fs.get(v.index, 0)
            if (
                co.z < 1.50
                or abs(co.x) > 0.105
                or (co.z < 1.595 and (abs(co.x) > 0.064 or co.y > 0.038))
                or (is_full_body and fs in (3, 12, 106, 7, 8, 107))
            ):
                to_del.append(v)
        bmesh.ops.delete(bm, geom=to_del, context='VERTS')
        geom_all = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom_all, plane_co=(0.0, 0.0, 1.530), plane_no=(0.0, 0.0, 1.0), clear_inner=True)
        for v in bm.verts:
            co = v.co.copy()
            if co.z < 1.605:
                t = max(0.0, min(1.0, (1.605 - co.z) / 0.075))
                t_smooth = t * t * (3.0 - 2.0 * t)
                co.x *= (1.0 - 0.42 * t_smooth)
                co.y = (co.y + 0.024) * (1.0 - 0.38 * t_smooth) - 0.026
            v.co = co
        bm.to_mesh(head_obj.data)
        bm.free()
    else:
        for v in head_obj.data.vertices:
            v.co = v.co * scale + Vector((0.0, dy, dz))

    for e in [eye_l, eye_r]:
        for v in e.data.vertices:
            v.co = v.co * scale + Vector((0.0, dy - 0.0012, dz))
        bpy.context.view_layer.objects.active = e
        sub = e.modifiers.new("Sub", 'SUBSURF')
        sub.levels = 2
        sub.render_levels = 2
        bpy.ops.object.modifier_apply(modifier="Sub")
        for p in e.data.polygons:
            p.use_smooth = True


def paint_eyes(eye_l, eye_r, iris_inner_rgb, iris_outer_rgb, mat_name, pupil_r=0.0026, iris_r=0.0063):
    for e in [eye_l, eye_r]:
        ecenter = sum((v.co for v in e.data.vertices), Vector()) / len(e.data.vertices)
        ecol = e.data.color_attributes.new(name="Col", type='BYTE_COLOR', domain='CORNER')
        for poly in e.data.polygons:
            for li in poly.loop_indices:
                vi = e.data.loops[li].vertex_index
                co = e.data.vertices[vi].co - ecenter
                r_front = math.sqrt(co.x**2 + co.z**2)
                if co.y < 0 and r_front < pupil_r:
                    er, eg, eb = 0.01, 0.01, 0.015
                elif co.y < 0 and r_front < iris_r:
                    t = (r_front - pupil_r) / (iris_r - pupil_r)
                    angle = math.atan2(co.z, co.x)
                    fibers = 0.5 + 0.5 * math.sin(angle * 28.0)
                    limbal = max(0.0, min(1.0, (t - 0.74) / 0.26))
                    ir = iris_inner_rgb[0] * (1 - t) + iris_outer_rgb[0] * t + 0.09 * fibers
                    ig = iris_inner_rgb[1] * (1 - t) + iris_outer_rgb[1] * t + 0.09 * fibers
                    ib = iris_inner_rgb[2] * (1 - t) + iris_outer_rgb[2] * t + 0.09 * fibers
                    er = ir * (1.0 - 0.80 * limbal)
                    eg = ig * (1.0 - 0.80 * limbal)
                    eb = ib * (1.0 - 0.80 * limbal)
                else:
                    er, eg, eb = 0.88, 0.85, 0.83
                ecol.data[li].color = (er, eg, eb, 1.0)
    eye_mat = bpy.data.materials.new(mat_name)
    eye_mat["uses_vcol"] = True
    ebsfd = eye_mat.node_tree.nodes.get("Principled BSDF")
    evcol = eye_mat.node_tree.nodes.new("ShaderNodeVertexColor")
    evcol.layer_name = "Col"
    eye_mat.node_tree.links.new(evcol.outputs["Color"], ebsfd.inputs["Base Color"])
    ebsfd.inputs["Roughness"].default_value = 0.02
    if "Coat Weight" in ebsfd.inputs:
        ebsfd.inputs["Coat Weight"].default_value = 1.0
        ebsfd.inputs["Coat Roughness"].default_value = 0.01
    for e in [eye_l, eye_r]:
        e.data.materials.clear()
        e.data.materials.append(eye_mat)


def paint_head_skin(head_obj, base_rgb, lip_rgb, brow_rgb, lip_z, lip_y, brow_z_base, stubble_strength=0.0, beard_strength=0.0, nail_rgb=None, mat_name="SkinMat"):
    color_attr = head_obj.data.color_attributes.new(name="Col", type='BYTE_COLOR', domain='CORNER')
    fs_attr = head_obj.data.attributes.get(".sculpt_face_set")
    vert_relief = {}

    for poly_i, poly in enumerate(head_obj.data.polygons):
        fs_val = fs_attr.data[poly_i].value if fs_attr else 0
        is_nail = (nail_rgb is not None) and (fs_val in (67, 71, 75, 79, 83, 87, 91, 95, 99, 103))
        for li in poly.loop_indices:
            vi = head_obj.data.loops[li].vertex_index
            co = head_obj.data.vertices[vi].co
            if is_nail:
                color_attr.data[li].color = (nail_rgb[0]**2.2, nail_rgb[1]**2.2, nail_rgb[2]**2.2, 1.0)
                continue
            r, g, b = base_rgb
            if co.z > 1.45:
                ax = abs(co.x)
                cheek_d2 = ((ax - 0.046) / 0.032)**2 + ((co.y + 0.105) / 0.035)**2 + ((co.z - 1.685) / 0.028)**2
                if cheek_d2 < 4.0:
                    w = 0.24 * math.exp(-cheek_d2)
                    r = r * (1 - w) + (base_rgb[0] * 1.03) * w
                    g = g * (1 - w) + (base_rgb[1] * 0.76) * w
                    b = b * (1 - w) + (base_rgb[2] * 0.78) * w
                nose_d2 = (ax / 0.020)**2 + ((co.y + 0.140) / 0.024)**2 + ((co.z - 1.688) / 0.024)**2
                if nose_d2 < 4.0:
                    w = 0.20 * math.exp(-nose_d2)
                    r = r * (1 - w) + (base_rgb[0] * 1.02) * w
                    g = g * (1 - w) + (base_rgb[1] * 0.80) * w
                    b = b * (1 - w) + (base_rgb[2] * 0.80) * w
                if co.y < -0.100 and (lip_z - 0.018) < co.z < (lip_z + 0.018) and ax < 0.032:
                    lip_d2 = (ax / 0.023)**2 + ((co.z - lip_z) / 0.0082)**2 + ((co.y - lip_y) / 0.016)**2
                    if lip_d2 < 3.5:
                        w = 0.82 * math.exp(-lip_d2 * 1.15)
                        r = r * (1 - w) + lip_rgb[0] * w
                        g = g * (1 - w) + lip_rgb[1] * w
                        b = b * (1 - w) + lip_rgb[2] * w
                eye_d2 = ((ax - 0.033) / 0.016)**2 + ((co.z - 1.719) / 0.0085)**2 + ((co.y + 0.095) / 0.018)**2
                if eye_d2 < 3.5:
                    w = 0.52 * math.exp(-eye_d2 * 1.2)
                    r = r * (1 - w) + brow_rgb[0] * w
                    g = g * (1 - w) + brow_rgb[1] * w
                    b = b * (1 - w) + brow_rgb[2] * w
                if 0.012 < ax < 0.057 and co.y < -0.095:
                    brow_z = brow_z_base + 0.12 * (ax - 0.015) - 3.0 * max(0.0, ax - 0.039)**2
                    dz_b = (co.z - brow_z) / 0.0046
                    dx_taper = max(0.0, min(1.0, (ax - 0.013) / 0.006)) * max(0.0, min(1.0, (0.056 - ax) / 0.009))
                    if abs(dz_b) < 2.5:
                        bw = 0.85 * math.exp(-dz_b * dz_b * 1.1) * dx_taper
                        r = r * (1 - bw) + brow_rgb[0] * bw
                        g = g * (1 - bw) + brow_rgb[1] * bw
                        b = b * (1 - bw) + brow_rgb[2] * bw
                if (beard_strength > 0.0 or stubble_strength > 0.0) and co.y < -0.062 and 1.580 < co.z < 1.682:
                    strength = max(beard_strength, stubble_strength)
                    m_z = 1.673 - 0.18 * ax
                    m_d2 = (ax / 0.026)**2 + ((co.z - m_z) / 0.0058)**2 + ((co.y + 0.125) / 0.018)**2
                    w_m = math.exp(-m_d2 * 1.1) if m_d2 < 3.5 else 0.0
                    upper_cut = 1.648 + 0.25 * max(0.0, ax - 0.022)
                    w_top = 1.0 / (1.0 + math.exp((co.z - upper_cut) / 0.0045))
                    w_bot = 1.0 / (1.0 + math.exp((1.592 - co.z) / 0.0060))
                    w_y = 1.0 / (1.0 + math.exp((co.y + 0.068) / 0.0080))
                    lip_mask = math.exp(-((ax / 0.025)**2 + ((co.z - lip_z) / 0.0095)**2))
                    sp_d2 = (ax / 0.0075)**2 + ((co.z - 1.646) / 0.0065)**2
                    w_sp = 0.75 * math.exp(-sp_d2) if sp_d2 < 3.0 and co.y < -0.110 else 0.0
                    w_total = max(w_m, w_sp, w_top * w_bot * w_y) * (1.0 - 0.92 * lip_mask)
                    strand = 0.90 + 0.10 * math.sin(co.x * 320.0 + co.z * 240.0)
                    bw = min(0.92, w_total * strength * strand)
                    r = r * (1 - bw) + brow_rgb[0] * bw
                    g = g * (1 - bw) + brow_rgb[1] * bw
                    b = b * (1 - bw) + brow_rgb[2] * bw
                    if beard_strength > 0.5 and w_total > 0.05:
                        vert_relief[vi] = 0.0014 * w_total * strand

            color_attr.data[li].color = (r**2.2, g**2.2, b**2.2, 1.0)

    if vert_relief:
        for vi, disp in vert_relief.items():
            v = head_obj.data.vertices[vi]
            v.co += v.normal * disp

    smat = bpy.data.materials.new(mat_name)
    smat["uses_vcol"] = True
    sbsdf = smat.node_tree.nodes.get("Principled BSDF")
    svcol = smat.node_tree.nodes.new("ShaderNodeVertexColor")
    svcol.layer_name = "Col"
    smat.node_tree.links.new(svcol.outputs["Color"], sbsdf.inputs["Base Color"])
    sbsdf.inputs["Roughness"].default_value = 0.42
    if "Specular IOR Level" in sbsdf.inputs:
        sbsdf.inputs["Specular IOR Level"].default_value = 0.34
    if "Subsurface Weight" in sbsdf.inputs:
        sbsdf.inputs["Subsurface Weight"].default_value = 0.04 if beard_strength > 0.5 else 0.14
    head_obj.data.materials.clear()
    head_obj.data.materials.append(smat)
    return smat


def import_hair_mesh(glb_filename, new_name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=f"{SCRATCH_DIR}/models/{glb_filename}")
    after = set(bpy.data.objects) - before
    h_obj = None
    for o in after:
        if o.name.startswith("Wolf3D_Hair"):
            h_obj = o
            break
    if h_obj:
        bpy.ops.object.select_all(action='DESELECT')
        h_obj.select_set(True)
        bpy.context.view_layer.objects.active = h_obj
        bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
        h_obj.modifiers.clear()
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        h_obj.name = new_name
    for o in list(after):
        if o != h_obj:
            bpy.data.objects.remove(o, do_unlink=True)
    return h_obj


def clone_and_recolor_pbr_mat(src_mat, new_name, pixel_transform_fn):
    m = src_mat.copy()
    m.name = new_name
    for n in m.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image and ("top-D" in n.image.name or "bottom-D" in n.image.name):
            w, h = n.image.size
            px = list(n.image.pixels)
            for i in range(0, len(px), 4):
                r, g, b, a = px[i], px[i+1], px[i+2], px[i+3]
                nr, ng, nb = pixel_transform_fn(r, g, b)
                px[i], px[i+1], px[i+2] = nr, ng, nb
            new_img = bpy.data.images.new(name=f"{new_name}_D", width=w, height=h, alpha=True)
            new_img.pixels[:] = px
            new_img.update()
            tmp_dir = os.path.join(PROJECT_DIR, "public", "assets", "pbr")
            os.makedirs(tmp_dir, exist_ok=True)
            tmp_path = os.path.join(tmp_dir, f"{new_name}_D.png")
            new_img.filepath_raw = tmp_path
            new_img.file_format = 'PNG'
            new_img.save()
            new_img.pack()
            n.image = new_img
    return m


def make_island_pbr_mat(src_mat, new_name, target_rgb, ref_lum=0.5, min_factor=0.35):
    def px_fn(r, g, b):
        lum = 0.299*r + 0.587*g + 0.114*b
        fac = min_factor + (1.0 - min_factor) * min(1.35, lum / max(0.015, ref_lum))
        return (min(1.0, target_rgb[0] * fac), min(1.0, target_rgb[1] * fac), min(1.0, target_rgb[2] * fac))
    return clone_and_recolor_pbr_mat(src_mat, new_name, px_fn)


def make_solid_mat(name, rgb, roughness=0.4, metallic=0.0, coat=0.0, alpha=1.0, emission_rgb=None):
    m = bpy.data.materials.new(name)
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Coat Weight" in bsdf.inputs and coat > 0:
        bsdf.inputs["Coat Weight"].default_value = coat
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        if hasattr(m, "blend_method"):
            m.blend_method = 'BLEND'
    if emission_rgb and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (emission_rgb[0], emission_rgb[1], emission_rgb[2], 1.0)
        bsdf.inputs["Emission Strength"].default_value = 0.35
    return m


def add_box_beam(bm, p0, p1, r, mat_idx):
    d = (p1 - p0)
    up = Vector((0, 0, 1)) if abs(d.normalized().z) < 0.9 else Vector((1, 0, 0))
    s = d.cross(up).normalized() * r
    u = s.cross(d).normalized() * r
    vs = [
        bm.verts.new(p0 - s - u), bm.verts.new(p0 + s - u), bm.verts.new(p0 + s + u), bm.verts.new(p0 - s + u),
        bm.verts.new(p1 - s - u), bm.verts.new(p1 + s - u), bm.verts.new(p1 + s + u), bm.verts.new(p1 - s + u),
    ]
    quads = [(0,1,5,4), (1,2,6,5), (2,3,7,6), (3,0,4,7), (0,3,2,1), (4,5,6,7)]
    for q in quads:
        f = bm.faces.new([vs[i] for i in q]); f.material_index = mat_idx


def assign_wedding_suit_islands(top_obj, mat_jacket_idx, mat_vest_idx, mat_shirt_idx, mat_btn_idx, mat_bowtie_idx=None, delete_bowtie=True, open_collar=False):
    bm = bmesh.new(); bm.from_mesh(top_obj.data)
    visited = set(); to_del = []
    for v in bm.verts:
        if v.index in visited: continue
        comp = []; stack = [v]; visited.add(v.index)
        while stack:
            c = stack.pop(); comp.append(c)
            for e in c.link_edges:
                o = e.other_vert(c)
                if o.index not in visited: visited.add(o.index); stack.append(o)
        xs = [c.co.x for c in comp]; ys = [c.co.y for c in comp]; zs = [c.co.z for c in comp]
        n_v = len(comp)
        is_rose = (max(xs) < -0.08 and 1.35 < min(zs) < 1.48 and n_v in (86, 13))
        is_bowtie = (min(zs) > 1.50 and max(zs) < 1.58 and max(ys) < -0.055)
        if is_rose or (is_bowtie and delete_bowtie):
            to_del.extend(comp)
            continue
        if is_bowtie and mat_bowtie_idx is not None:
            m_idx = mat_bowtie_idx
        elif n_v in (72, 52):
            m_idx = mat_vest_idx
        elif n_v == 41:
            m_idx = mat_btn_idx
        elif n_v in (46, 92, 75, 12, 11) or (n_v == 13 and max(xs) > -0.05):
            m_idx = mat_shirt_idx
            if open_collar:
                for c in comp:
                    if c.co.z > 1.44 and c.co.y < -0.04 and abs(c.co.x) < 0.045:
                        spread = (c.co.z - 1.44) / 0.14
                        c.co.x += (0.015 if c.co.x >= 0 else -0.015) * spread
        else:
            m_idx = mat_jacket_idx
        for c in comp:
            for f in c.link_faces:
                f.material_index = m_idx
    bmesh.ops.delete(bm, geom=to_del, context='VERTS')
    bm.to_mesh(top_obj.data); bm.free()


def import_and_pose_male_outfit(glb_filename, prefix, hand_skin_rgb, pants_rgb, scale_xy=1.0, configure_top_fn=None):
    """
    Imports Armature + Wolf3D_Outfit_Top + Wolf3D_Body (5-finger hands) + Wolf3D_Outfit_Bottom (trousers),
    applies per-island materials to Top, poses the Armature into a natural seated poker-table posture
    with pronated palms and gently curled 5 fingers, applies modifiers, and returns:
      (top_obj, hands_obj, pants_obj)
    """
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=f"{SCRATCH_DIR}/models/{glb_filename}")
    after = set(bpy.data.objects) - before

    arm_obj = None
    top_obj = None
    body_obj = None
    bot_obj = None
    for o in after:
        if o.type == 'ARMATURE':
            arm_obj = o
        elif o.name.startswith("Wolf3D_Outfit_Top"):
            top_obj = o
        elif o.name.startswith("Wolf3D_Body"):
            body_obj = o
        elif o.name.startswith("Wolf3D_Outfit_Bottom"):
            bot_obj = o

    keep = {arm_obj, top_obj, body_obj, bot_obj}
    for o in list(after):
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)

    # Configure top materials and islands while in bind pose
    if configure_top_fn and top_obj:
        configure_top_fn(top_obj)

    # Trim Wolf3D_Body in bind pose to keep only the 5-finger hands & wrists (delete ankles/feet)
    hand_vgs = {
        g.index for g in body_obj.vertex_groups
        if ("Hand" in g.name or "ForeArm" in g.name)
    }
    bm_b = bmesh.new()
    bm_b.from_mesh(body_obj.data)
    dlayer = bm_b.verts.layers.deform.active
    del_verts = []
    for v in bm_b.verts:
        d = v[dlayer]
        w_hand = sum( weight for vg_idx, weight in d.items() if vg_idx in hand_vgs )
        if w_hand < 0.05:
            del_verts.append(v)
    bmesh.ops.delete(bm_b, geom=del_verts, context='VERTS')
    bm_b.to_mesh(body_obj.data)
    bm_b.free()

    # Pose Armature into natural seated poker posture
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode='POSE')

    def aim_bone(bname, target_dir):
        pb = arm_obj.pose.bones.get(bname)
        if not pb:
            return
        cur = (pb.tail - pb.head).normalized()
        q = cur.rotation_difference(target_dir.normalized())
        pb.matrix = Matrix.Translation(pb.head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-pb.head) @ pb.matrix
        bpy.context.view_layer.update()

    for side, s in [("Left", 1.0), ("Right", -1.0)]:
        sh = Vector((s * 0.166, 0.038, 1.503))
        el = Vector((s * 0.205, 0.025, 1.240))
        wr = Vector((s * 0.185, -0.175, 1.150))
        hd = Vector((s * 0.175, -0.255, 1.125))
        aim_bone(f"{side}Arm", el - sh)
        aim_bone(f"{side}ForeArm", wr - el)
        aim_bone(f"{side}Hand", hd - wr)

        # Pronate forearm (50%) and hand (50%) so palms face downward toward poker felt
        pb_fa = arm_obj.pose.bones[f"{side}ForeArm"]
        pb_h = arm_obj.pose.bones[f"{side}Hand"]
        pb_i = arm_obj.pose.bones[f"{side}HandIndex1"]
        pb_p = arm_obj.pose.bones[f"{side}HandPinky1"]
        y_dir = (pb_h.tail - pb_h.head).normalized()
        cur_k = (pb_i.head - pb_p.head)
        cur_k = (cur_k - y_dir * cur_k.dot(y_dir)).normalized()
        tgt_k = Vector((-s * 0.92, 0.0, 0.38))
        tgt_k = (tgt_k - y_dir * tgt_k.dot(y_dir)).normalized()
        q_roll = cur_k.rotation_difference(tgt_k)
        q_half = Quaternion((1, 0, 0, 0)).slerp(q_roll, 0.5)
        pb_fa.matrix = Matrix.Translation(pb_fa.head) @ q_half.to_matrix().to_4x4() @ Matrix.Translation(-pb_fa.head) @ pb_fa.matrix
        bpy.context.view_layer.update()

        aim_bone(f"{side}Hand", hd - wr)
        y_dir = (pb_h.tail - pb_h.head).normalized()
        cur_k = (pb_i.head - pb_p.head)
        cur_k = (cur_k - y_dir * cur_k.dot(y_dir)).normalized()
        tgt_k = Vector((-s * 0.92, 0.0, 0.38))
        tgt_k = (tgt_k - y_dir * tgt_k.dot(y_dir)).normalized()
        q_roll2 = cur_k.rotation_difference(tgt_k)
        pb_h.matrix = Matrix.Translation(pb_h.head) @ q_roll2.to_matrix().to_4x4() @ Matrix.Translation(-pb_h.head) @ pb_h.matrix
        bpy.context.view_layer.update()

        # Gently curl all 4 fingers downward toward the poker felt
        curl_target = Vector((-s * 0.04, -0.52, -0.85)).normalized()
        for fname in ["Index", "Middle", "Ring", "Pinky"]:
            for j_idx, blend_fac in [(1, 0.22), (2, 0.35), (3, 0.28)]:
                bname = f"{side}Hand{fname}{j_idx}"
                pb_f = arm_obj.pose.bones.get(bname)
                if pb_f:
                    cur_f = (pb_f.tail - pb_f.head).normalized()
                    q_f = Quaternion((1, 0, 0, 0)).slerp(cur_f.rotation_difference(curl_target), blend_fac)
                    pb_f.matrix = Matrix.Translation(pb_f.head) @ q_f.to_matrix().to_4x4() @ Matrix.Translation(-pb_f.head) @ pb_f.matrix
                    bpy.context.view_layer.update()

    bpy.ops.object.mode_set(mode='OBJECT')

    # Apply Armature modifier on top_obj, body_obj, bot_obj
    for obj, new_name in [(top_obj, f"{prefix}_Top"), (body_obj, f"{prefix}_Hands"), (bot_obj, f"{prefix}_Pants")]:
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        for m in list(obj.modifiers):
            if m.type == 'ARMATURE':
                bpy.ops.object.modifier_apply(modifier=m.name)
            else:
                obj.modifiers.remove(m)
        bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        obj.name = new_name
        if scale_xy != 1.0:
            for v in obj.data.vertices:
                v.co.x *= scale_xy
                v.co.y *= scale_xy
        for p in obj.data.polygons:
            p.use_smooth = True

    bpy.data.objects.remove(arm_obj, do_unlink=True)

    # Trim pants below z = 0.78 so only upper seated trousers/hips remain
    bm_p = bmesh.new()
    bm_p.from_mesh(bot_obj.data)
    del_p = [v for v in bm_p.verts if v.co.z < 0.78]
    bmesh.ops.delete(bm_p, geom=del_p, context='VERTS')
    bm_p.to_mesh(bot_obj.data)
    bm_p.free()

    # Assign tailored PBR material to pants and realistic skin material to 5-finger hands
    if bot_obj.data.materials:
        p_mat = make_island_pbr_mat(bot_obj.data.materials[0], f"{prefix}PantsPBR", pants_rgb, ref_lum=0.45, min_factor=0.30)
        bot_obj.data.materials.clear()
        bot_obj.data.materials.append(p_mat)
    else:
        bot_obj.data.materials.append(make_solid_mat(f"{prefix}PantsMat", pants_rgb, roughness=0.48))

    h_mat = make_solid_mat(
        f"{prefix}HandSkinMat",
        (hand_skin_rgb[0]**2.2, hand_skin_rgb[1]**2.2, hand_skin_rgb[2]**2.2),
        roughness=0.42,
    )
    if "Subsurface Weight" in h_mat.node_tree.nodes["Principled BSDF"].inputs:
        h_mat.node_tree.nodes["Principled BSDF"].inputs["Subsurface Weight"].default_value = 0.14
    body_obj.data.materials.clear()
    body_obj.data.materials.append(h_mat)

    return top_obj, body_obj, bot_obj


def fit_hair_outside_scalp(hair_obj, head_obj, clearance=0.0038):
    """Push any hair vertex that penetrates the cranium/temple scalp outward along the head surface normal."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bvh_head = BVHTree.FromObject(head_obj, depsgraph)
    for v in hair_obj.data.vertices:
        if v.co.z < 1.62:
            continue
        loc, norm, idx, dist = bvh_head.find_nearest(v.co)
        if loc and norm:
            signed_d = (v.co - loc).dot(norm)
            if signed_d < clearance:
                v.co = loc + norm * clearance
    hair_obj.data.update()


# ==============================================================================
# 1. VIKTOR ("The Shark")
# ==============================================================================
v_head, v_el, v_er = duplicate_pair("GEO-body_male_realistic", "GEO-body_male_realistic.eye.L", "GEO-body_male_realistic.eye.R", "Viktor")
prepare_head_and_eyes(v_head, v_el, v_er, 1.0, +0.0206, +0.0420, multires_level=2, trim_to_neck=True)
paint_head_skin(v_head, (0.76, 0.56, 0.45), (0.52, 0.28, 0.27), (0.12, 0.11, 0.12), lip_z=1.6610, lip_y=-0.1246, brow_z_base=1.742, stubble_strength=0.14, mat_name="ViktorSkin")
paint_eyes(v_el, v_er, (0.28, 0.48, 0.65), (0.14, 0.28, 0.42), "ViktorEyeMat")

v_hair = import_hair_mesh("rpm_pulkit.glb", "ViktorHair")
bpy.context.view_layer.objects.active = v_hair
sub = v_hair.modifiers.new("Sub", 'SUBSURF'); sub.levels = 1; bpy.ops.object.modifier_apply(modifier="Sub")
for v in v_hair.data.vertices:
    v.co.x *= 1.05
    v.co.y = v.co.y * 1.04 + 0.006
    v.co.z = (v.co.z - 1.73) * 1.01 + 1.728
fit_hair_outside_scalp(v_hair, v_head, clearance=0.0038)
h_col = v_hair.data.color_attributes.new(name="Col", type='BYTE_COLOR', domain='CORNER')
for poly in v_hair.data.polygons:
    poly.use_smooth = True
    for li in poly.loop_indices:
        co = v_hair.data.vertices[v_hair.data.loops[li].vertex_index].co
        hr, hg, hb = 0.065, 0.070, 0.082
        ax = abs(co.x)
        if ax > 0.065 and 1.63 < co.z < 1.76:
            streak = max(0.0, min(1.0, (ax - 0.065) / 0.022)) * math.exp(-((co.z - 1.695) / 0.042)**2)
            hr = hr * (1 - streak) + 0.62 * streak
            hg = hg * (1 - streak) + 0.64 * streak
            hb = hb * (1 - streak) + 0.68 * streak
        h_col.data[li].color = (hr, hg, hb, 1.0)
v_hmat = bpy.data.materials.new("ViktorHairMat")
v_hmat["uses_vcol"] = True
hbsdf = v_hmat.node_tree.nodes.get("Principled BSDF")
hvcol = v_hmat.node_tree.nodes.new("ShaderNodeVertexColor"); hvcol.layer_name = "Col"
v_hmat.node_tree.links.new(hvcol.outputs["Color"], hbsdf.inputs["Base Color"])
hbsdf.inputs["Roughness"].default_value = 0.38
v_hair.data.materials.clear(); v_hair.data.materials.append(v_hmat)

def config_viktor_top(t_obj):
    base_suit_mat = t_obj.data.materials[0]
    mat_v_jacket = make_island_pbr_mat(base_suit_mat, "ViktorJacketPBR", (0.06, 0.10, 0.20), ref_lum=0.48, min_factor=0.30)
    mat_v_vest   = make_island_pbr_mat(base_suit_mat, "ViktorVestPBR",   (0.045, 0.075, 0.15), ref_lum=0.35, min_factor=0.30)
    mat_v_shirt  = make_island_pbr_mat(base_suit_mat, "ViktorShirtPBR",  (0.92, 0.94, 0.97), ref_lum=0.70, min_factor=0.72)
    mat_v_btn    = make_solid_mat("ViktorHornBtn", (0.04, 0.05, 0.08), roughness=0.25)
    mat_v_tie    = make_solid_mat("ViktorTieNavySilk", (0.03, 0.06, 0.16), roughness=0.22, coat=0.6)
    mat_v_pocket = make_solid_mat("ViktorPocketEmerald", (0.03, 0.34, 0.18), roughness=0.32)
    mat_v_gold   = make_solid_mat("ViktorWatchGold", (0.90, 0.72, 0.22), roughness=0.18, metallic=0.92)
    t_obj.data.materials.clear()
    for m in [mat_v_jacket, mat_v_vest, mat_v_shirt, mat_v_btn, mat_v_tie, mat_v_pocket, mat_v_gold]:
        t_obj.data.materials.append(m)
    assign_wedding_suit_islands(t_obj, 0, 1, 2, 3, delete_bowtie=True)

v_top, v_hands, v_pants = import_and_pose_male_outfit(
    "readyplayer.me.glb", "Viktor", (0.76, 0.56, 0.45), (0.05, 0.08, 0.16), configure_top_fn=config_viktor_top
)
bm = bmesh.new(); bm.from_mesh(v_top.data)
knot_verts = [
    bm.verts.new((-0.015, -0.072, 1.548)), bm.verts.new((0.015, -0.072, 1.548)),
    bm.verts.new((0.010, -0.082, 1.518)), bm.verts.new((-0.010, -0.082, 1.518)),
    bm.verts.new((-0.020, -0.118, 1.410)), bm.verts.new((0.020, -0.118, 1.410)),
    bm.verts.new((0.0, -0.138, 1.345)),
]
for verts in ([knot_verts[0], knot_verts[1], knot_verts[2], knot_verts[3]],
              [knot_verts[3], knot_verts[2], knot_verts[5], knot_verts[4]],
              [knot_verts[4], knot_verts[5], knot_verts[6]]):
    f = bm.faces.new(verts); f.material_index = 4
ps_verts = [
    bm.verts.new((0.085, -0.132, 1.365)), bm.verts.new((0.130, -0.125, 1.362)),
    bm.verts.new((0.116, -0.136, 1.398)), bm.verts.new((0.095, -0.138, 1.392)),
]
fps = bm.faces.new(ps_verts); fps.material_index = 5
bm.to_mesh(v_top.data); bm.free()


# ==============================================================================
# 2. DEALER (Monte Carlo VIP Croupier)
# ==============================================================================
d_head, d_el, d_er = duplicate_pair("GEO-body_male_realistic", "GEO-body_male_realistic.eye.L", "GEO-body_male_realistic.eye.R", "Dealer")
prepare_head_and_eyes(d_head, d_el, d_er, 1.0, +0.0206, +0.0420, multires_level=2, trim_to_neck=True)
for v in d_head.data.vertices:
    ax = abs(v.co.x)
    if 1.63 < v.co.z < 1.71 and v.co.y < -0.05:
        v.co.x *= 1.035
    if 0.015 < ax < 0.032 and 1.652 < v.co.z < 1.672 and v.co.y < -0.105:
        v.co.z += 0.0022 * ((ax - 0.015) / 0.017)

paint_head_skin(d_head, (0.77, 0.58, 0.47), (0.54, 0.30, 0.28), (0.032, 0.022, 0.018), lip_z=1.6610, lip_y=-0.1246, brow_z_base=1.741, beard_strength=0.98, mat_name="DealerSkin")
paint_eyes(d_el, d_er, (0.44, 0.28, 0.12), (0.22, 0.14, 0.06), "DealerEyeMat")

d_hair = import_hair_mesh("rpm_pulkit.glb", "DealerHair")
bpy.context.view_layer.objects.active = d_hair
sub = d_hair.modifiers.new("Sub", 'SUBSURF'); sub.levels = 1; bpy.ops.object.modifier_apply(modifier="Sub")
for v in d_hair.data.vertices:
    v.co.x = -v.co.x * 1.06
    v.co.y = v.co.y * 1.04 + 0.006
    v.co.z = (v.co.z - 1.73) * 1.01 + 1.728
bm = bmesh.new(); bm.from_mesh(d_hair.data); bmesh.ops.reverse_faces(bm, faces=bm.faces); bm.to_mesh(d_hair.data); bm.free()
fit_hair_outside_scalp(d_hair, d_head, clearance=0.0042)
for p in d_hair.data.polygons: p.use_smooth = True
d_hair.data.materials.clear()
d_hair.data.materials.append(make_solid_mat("DealerHairMat", (0.04, 0.030, 0.025), roughness=0.40))

def config_dealer_top(t_obj):
    base_d_mat = t_obj.data.materials[0]
    mat_d_jacket = make_island_pbr_mat(base_d_mat, "DealerJacketPBR", (0.038, 0.038, 0.045), ref_lum=0.48, min_factor=0.28)
    mat_d_vest   = make_island_pbr_mat(base_d_mat, "DealerVestPBR",   (0.025, 0.025, 0.030), ref_lum=0.35, min_factor=0.28)
    mat_d_shirt  = make_island_pbr_mat(base_d_mat, "DealerShirtPBR",  (0.94, 0.95, 0.98), ref_lum=0.70, min_factor=0.74)
    mat_d_gold   = make_solid_mat("DealerGold", (0.88, 0.68, 0.20), roughness=0.22, metallic=0.88)
    mat_d_shoe   = make_solid_mat("DealerShoeAcrylic", (0.08, 0.08, 0.10), roughness=0.12, coat=0.9)
    t_obj.data.materials.clear()
    for m in [mat_d_jacket, mat_d_vest, mat_d_shirt, mat_d_gold, mat_d_shoe]:
        t_obj.data.materials.append(m)
    assign_wedding_suit_islands(t_obj, 0, 1, 2, 3, mat_bowtie_idx=3, delete_bowtie=False)

d_top, d_hands, d_pants = import_and_pose_male_outfit(
    "readyplayer.me.glb", "Dealer", (0.77, 0.58, 0.47), (0.03, 0.03, 0.038), configure_top_fn=config_dealer_top
)


# ==============================================================================
# 3. ELENA ("The Rock")
# ==============================================================================
e_body, e_el, e_er = duplicate_pair("GEO-body_female_realistic", "GEO-body_female_realistic.eye.L", "GEO-body_female_realistic.eye.R", "Elena")
prepare_head_and_eyes(e_body, e_el, e_er, 1.075, +0.0339, +0.0695, multires_level=2, trim_to_neck=False)

# Pose Elena's bare arms & 5-finger hands in-place using her .sculpt_face_set partitions before trimming
fs_attr_e = e_body.data.attributes.get(".sculpt_face_set")
vert_fs_e = {}
if fs_attr_e:
    for p_i, p in enumerate(e_body.data.polygons):
        val = fs_attr_e.data[p_i].value
        for vi in p.vertices:
            vert_fs_e[vi] = val

arm_fs_e = set([20, 21, 11, 12, 9, 10] + list(range(64, 104)))
for v in e_body.data.vertices:
    co = v.co.copy()
    ax = abs(co.x)
    if 0.018 < ax < 0.052 and 1.720 < co.z < 1.736 and co.y < -0.092:
        w_lid = math.exp(-((ax - 0.035) / 0.012)**2) * math.exp(-((co.z - 1.727) / 0.005)**2)
        co.z -= 0.0028 * w_lid
        co.y -= 0.0010 * w_lid

    fs = vert_fs_e.get(v.index, 0)
    if fs in arm_fs_e or abs(co.x) > 0.142:
        s = 1.0 if co.x >= 0 else -1.0
        sh = Vector((s * 0.142, 0.020, 1.430))
        el_old = Vector((s * 0.253, 0.056, 1.199))
        wr_old = Vector((s * 0.378, -0.008, 0.996))
        u_len = (el_old - sh).length
        f_len = (wr_old - el_old).length
        el_new = sh + Vector((s * 0.11, 0.04, -0.992)).normalized() * u_len
        wr_new = el_new + Vector((-s * 0.14, -0.95, -0.16)).normalized() * (f_len * 0.85)

        q_upper = (el_old - sh).normalized().rotation_difference((el_new - sh).normalized())
        d_sh = (co - sh).length
        w_sh = max(0.0, min(1.0, (d_sh - 0.01) / 0.055))
        w_sh = w_sh * w_sh * (3.0 - 2.0 * w_sh)

        fa_axis_old = (wr_old - el_old).normalized()
        proj_el = (co - el_old).dot(fa_axis_old)
        w_el = max(0.0, min(1.0, (proj_el + 0.025) / 0.055))
        w_el = w_el * w_el * (3.0 - 2.0 * w_el)
        w_pron = max(0.0, min(1.0, proj_el / f_len))

        q_u = Quaternion((1, 0, 0, 0)).slerp(q_upper, w_sh)
        co1 = sh + q_u @ (co - sh)
        el_cur = sh + q_upper @ (el_old - sh)
        wr_after_u = sh + q_upper @ (wr_old - sh)

        q_lower = (wr_after_u - el_cur).normalized().rotation_difference((wr_new - el_cur).normalized())
        q_l = Quaternion((1, 0, 0, 0)).slerp(q_lower, w_el)
        co2 = el_cur + q_l @ (co1 - el_cur)

        fa_axis_new = (wr_new - el_cur).normalized()
        q_pron = Quaternion(fa_axis_new, +s * math.radians(66.0) * w_pron * w_el)
        co = el_cur + q_pron @ (co2 - el_cur)
    v.co = co

mat_e_skin = paint_head_skin(
    e_body, (0.80, 0.61, 0.51), (0.58, 0.16, 0.22), (0.08, 0.05, 0.045),
    lip_z=1.6524, lip_y=-0.1349, brow_z_base=1.737, nail_rgb=(0.52, 0.08, 0.16), mat_name="ElenaSkin"
)
mat_e_gown = make_solid_mat("ElenaBurgundyVelvet", (0.20, 0.012, 0.032), roughness=0.74, coat=0.0)
if "Sheen Weight" in mat_e_gown.node_tree.nodes["Principled BSDF"].inputs:
    mat_e_gown.node_tree.nodes["Principled BSDF"].inputs["Sheen Weight"].default_value = 0.85
mat_e_gold = make_solid_mat("ElenaGoldJewelry", (0.90, 0.70, 0.22), roughness=0.18, metallic=0.92)
mat_e_ruby = make_solid_mat("ElenaRubyGem", (0.72, 0.02, 0.10), roughness=0.06, coat=1.0)

# Build Elena's Burgundy Velvet Off-Shoulder Evening Gown from her torso/hip face sets (fs in (1, 18, 19))
gown_mesh = e_body.data.copy()
e_gown = bpy.data.objects.new("ElenaGown", gown_mesh)
bpy.context.scene.collection.objects.link(e_gown)
e_gown.data.materials.clear()
e_gown.data.materials.append(mat_e_gown)

fs_attr_g = e_gown.data.attributes.get(".sculpt_face_set")
bm_g = bmesh.new(); bm_g.from_mesh(e_gown.data)
bm_g.faces.ensure_lookup_table()
non_torso_faces = [f for i, f in enumerate(bm_g.faces) if fs_attr_g and fs_attr_g.data[i].value not in (1, 18, 19)]
bmesh.ops.delete(bm_g, geom=non_torso_faces, context='FACES')
del_low = [v for v in bm_g.verts if v.co.z < 0.82 or len(v.link_faces) == 0]
bmesh.ops.delete(bm_g, geom=del_low, context='VERTS')
geom_all = bm_g.verts[:] + bm_g.edges[:] + bm_g.faces[:]
bmesh.ops.bisect_plane(bm_g, geom=geom_all, plane_co=(0, 0, 1.375), plane_no=(0, 0, 1), clear_outer=True)
for v in bm_g.verts:
    sweetheart = 0.016 * math.sin(min(1.0, abs(v.co.x) / 0.14) * math.pi) - 0.012 * (1.0 - min(1.0, abs(v.co.x) / 0.06))
    if v.co.z > 1.32:
        t_top = (v.co.z - 1.32) / (1.375 - 1.32)
        v.co.z += sweetheart * t_top
    v.co += v.normal * 0.0042
bm_g.to_mesh(e_gown.data); bm_g.free()
for p in e_gown.data.polygons: p.use_smooth = True

# Trim e_body legs below z = 0.88 (keeping head, neck, torso, bare arms, and 5-finger hands!)
bm_eb = bmesh.new(); bm_eb.from_mesh(e_body.data)
bm_eb.faces.ensure_lookup_table()
leg_faces = [
    f for i, f in enumerate(bm_eb.faces)
    if fs_attr_e and fs_attr_e.data[i].value not in (17, 22, 2, 3, 4, 5, 7, 8, 1, 18, 19, 20, 21, 11, 12, 9, 10, *range(64, 104))
]
bmesh.ops.delete(bm_eb, geom=leg_faces, context='FACES')
loose_v = [v for v in bm_eb.verts if len(v.link_faces) == 0 or (v.co.z < 0.88 and abs(v.co.x) < 0.16)]
bmesh.ops.delete(bm_eb, geom=loose_v, context='VERTS')
bm_eb.to_mesh(e_body.data); bm_eb.free()
e_body.data.update()

paint_eyes(e_el, e_er, (0.48, 0.26, 0.09), (0.22, 0.11, 0.04), "ElenaEyeMat", pupil_r=0.0028, iris_r=0.0072)

e_hair = import_hair_mesh("rpm_pulkit.glb", "ElenaHair")
bpy.context.view_layer.objects.active = e_hair
sub = e_hair.modifiers.new("Sub", 'SUBSURF'); sub.levels = 1; bpy.ops.object.modifier_apply(modifier="Sub")
bvh_e = BVHTree.FromObject(e_body, bpy.context.evaluated_depsgraph_get())
for v in e_hair.data.vertices:
    v.co.x *= 1.02
    v.co.y = v.co.y * 1.03 + 0.010
    v.co.z = (v.co.z - 1.73) * 0.98 + 1.712
    if abs(v.co.x) > 0.052 and v.co.y < -0.02 and 1.69 < v.co.z < 1.79:
        v.co.z -= 0.006
    loc, norm, idx, dist = bvh_e.find_nearest(v.co)
    if loc and (v.co - loc).dot(norm) < 0.0030:
        v.co = loc + norm * 0.0030

e_hair_mat = make_solid_mat("ElenaEspressoHair", (0.045, 0.030, 0.025), roughness=0.45, coat=0.10)
e_hair.data.materials.clear()
for m in [e_hair_mat, mat_e_gold, mat_e_ruby]:
    e_hair.data.materials.append(m)

bm = bmesh.new(); bm.from_mesh(e_hair.data)
bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=20, radius=0.052, matrix=Matrix.Translation((0.0, 0.020, 1.842)) @ Matrix.Diagonal((1.05, 0.95, 0.85, 1.0)))
for v in bm.verts:
    if v.co.z > 1.800 and v.co.y > -0.045:
        braid = 0.0025 * math.sin(v.co.x * 160.0 + v.co.z * 160.0) * math.cos(v.co.y * 140.0)
        v.co += v.normal * braid
for f in bm.faces:
    if f.calc_center_median().z > 1.800:
        f.material_index = 0

for i in range(36):
    a0 = (i / 36.0) * 2 * math.pi
    a1 = ((i + 1) / 36.0) * 2 * math.pi
    r_cuff = 0.046
    v0 = bm.verts.new((r_cuff * math.cos(a0), 0.020 + r_cuff * math.sin(a0), 1.806))
    v1 = bm.verts.new((r_cuff * math.cos(a1), 0.020 + r_cuff * math.sin(a1), 1.806))
    v2 = bm.verts.new((r_cuff * math.cos(a1), 0.020 + r_cuff * math.sin(a1), 1.818))
    v3 = bm.verts.new((r_cuff * math.cos(a0), 0.020 + r_cuff * math.sin(a0), 1.818))
    fc = bm.faces.new([v0, v1, v2, v3]); fc.material_index = 1

for sx in (-1.0, 1.0):
    ex, ey, ez = sx * 0.075, -0.045, 1.665
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.0045, matrix=Matrix.Translation((ex, ey, ez)))
    bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=10, radius=0.0075, matrix=Matrix.Translation((ex, ey, ez - 0.018)) @ Matrix.Diagonal((0.75, 0.65, 1.35, 1.0)))

for f in bm.faces:
    c = f.calc_center_median()
    if 1.63 < c.z < 1.68 and abs(c.x) > 0.065:
        f.material_index = 2 if c.z < 1.656 else 1
bm.to_mesh(e_hair.data); bm.free()
for p in e_hair.data.polygons: p.use_smooth = True

# Add Elena's 18K Gold Necklace & Ruby Pendant onto e_gown (so it belongs to Elena_Torso!)
e_gown.data.materials.append(mat_e_gold)
e_gown.data.materials.append(mat_e_ruby)
bm_gn = bmesh.new(); bm_gn.from_mesh(e_gown.data)
neck_pts = []
for i in range(33):
    t = (i / 32.0) * 2.0 - 1.0
    nx = t * 0.068
    nz = 1.485 - 0.032 * (1.0 - abs(t)**1.4)
    loc, norm, _, _ = bvh_e.find_nearest(Vector((nx, -0.12, nz)))
    if loc:
        neck_pts.append(loc + norm * 0.0022)
for i in range(len(neck_pts) - 1):
    add_box_beam(bm_gn, neck_pts[i], neck_pts[i+1], 0.0016, 1)
if neck_pts:
    mid_p = neck_pts[len(neck_pts)//2]
    bmesh.ops.create_uvsphere(bm_gn, u_segments=16, v_segments=12, radius=0.0085, matrix=Matrix.Translation(mid_p + Vector((0, -0.003, -0.008))) @ Matrix.Diagonal((0.85, 0.55, 1.25, 1.0)))
for f in bm_gn.faces:
    c = f.calc_center_median()
    if 1.42 < c.z < 1.465 and abs(c.x) > 0.015 and c.y < -0.07:
        f.material_index = 2
bm_gn.to_mesh(e_gown.data); bm_gn.free()


# ==============================================================================
# 4. BAO ("The Calling Station")
# ==============================================================================
b_head, b_el, b_er = duplicate_pair("GEO-head_animation_realistic", "GEO-head_animation_realistic.sclera.L", "GEO-head_animation_realistic.sclera.R", "Bao")
prepare_head_and_eyes(b_head, b_el, b_er, 1.0, +0.0039, +1.4400, multires_level=2, trim_to_neck=True)
for v in b_head.data.vertices:
    co = v.co
    ax = abs(co.x)
    if 1.59 < co.z < 1.75:
        w_cheek = math.exp(-((co.z - 1.675) / 0.055)**2)
        v.co.x *= (1.0 + 0.11 * w_cheek)
    if 1.69 < co.z < 1.73 and ax < 0.016 and co.y < -0.115:
        v.co.y += 0.0025 * math.exp(-((co.z - 1.712) / 0.015)**2)
    if 0.016 < ax < 0.048 and 1.720 < co.z < 1.734 and v.co.y < -0.095:
        v.co.y -= 0.0018
        v.co.z -= 0.0010

paint_head_skin(b_head, (0.79, 0.61, 0.46), (0.55, 0.32, 0.29), (0.04, 0.04, 0.05), lip_z=1.6558, lip_y=-0.1321, brow_z_base=1.741, mat_name="BaoSkin")
paint_eyes(b_el, b_er, (0.16, 0.09, 0.04), (0.07, 0.04, 0.02), "BaoEyeMat")

b_hair = import_hair_mesh("rpm_thanh.glb", "BaoHair")
bpy.context.view_layer.objects.active = b_hair
sub = b_hair.modifiers.new("Sub", 'SUBSURF'); sub.levels = 2; bpy.ops.object.modifier_apply(modifier="Sub")
for v in b_hair.data.vertices:
    v.co.x *= 1.12
    v.co.y = v.co.y * 1.06 + 0.004
    v.co.z = (v.co.z - 1.74) * 1.02 + 1.725
fit_hair_outside_scalp(b_hair, b_head, clearance=0.0038)
for p in b_hair.data.polygons: p.use_smooth = True
b_hair.data.materials.clear()
b_hair.data.materials.append(make_solid_mat("BaoJetBlackHair", (0.025, 0.028, 0.035), roughness=0.38))
b_hair.data.materials.append(make_solid_mat("BaoGlassesFrame", (0.04, 0.045, 0.055), roughness=0.18, metallic=0.80))
b_hair.data.materials.append(make_solid_mat("BaoGlassesLensCyan", (0.12, 0.55, 0.85), roughness=0.03, coat=1.0, alpha=0.18, emission_rgb=(0.06, 0.32, 0.55)))

bm = bmesh.new(); bm.from_mesh(b_hair.data)
gy = -0.128
for sx in (-1.0, 1.0):
    cx, cz = sx * 0.034, 1.717
    hw, hh = 0.025, 0.014
    c00 = Vector((cx - hw, gy, cz - hh))
    c10 = Vector((cx + hw, gy, cz - hh))
    c11 = Vector((cx + hw, gy, cz + hh))
    c01 = Vector((cx - hw, gy, cz + hh))
    add_box_beam(bm, c00, c10, 0.0014, 1)
    add_box_beam(bm, c10, c11, 0.0014, 1)
    add_box_beam(bm, c11, c01, 0.0014, 1)
    add_box_beam(bm, c01, c00, 0.0014, 1)
    outer_x = cx + sx * hw
    add_box_beam(bm, Vector((outer_x, gy, cz + 0.004)), Vector((sx * 0.082, -0.015, cz + 0.002)), 0.0014, 1)
    lv = [bm.verts.new(c00), bm.verts.new(c10), bm.verts.new(c11), bm.verts.new(c01)]
    fl = bm.faces.new(lv if sx > 0 else list(reversed(lv))); fl.material_index = 2
add_box_beam(bm, Vector((-0.009, gy - 0.001, 1.721)), Vector((0.009, gy - 0.001, 1.721)), 0.0015, 1)
bm.to_mesh(b_hair.data); bm.free()

def config_bao_top(t_obj):
    base_b_mat = t_obj.data.materials[0]
    mat_b_jacket = make_island_pbr_mat(base_b_mat, "BaoEmeraldJacketPBR", (0.035, 0.145, 0.110), ref_lum=0.48, min_factor=0.30)
    mat_b_vest   = make_island_pbr_mat(base_b_mat, "BaoSlateVestPBR",     (0.028, 0.065, 0.058), ref_lum=0.35, min_factor=0.30)
    mat_b_shirt  = make_island_pbr_mat(base_b_mat, "BaoCharcoalShirtPBR", (0.045, 0.052, 0.058), ref_lum=0.70, min_factor=0.30)
    mat_b_btn    = make_solid_mat("BaoDarkBtn", (0.03, 0.04, 0.04), roughness=0.25)
    t_obj.data.materials.clear()
    for m in [mat_b_jacket, mat_b_vest, mat_b_shirt, mat_b_btn]:
        t_obj.data.materials.append(m)
    assign_wedding_suit_islands(t_obj, 0, 1, 2, 3, delete_bowtie=True, open_collar=True)

b_top, b_hands, b_pants = import_and_pose_male_outfit(
    "readyplayer.me.glb", "Bao", (0.79, 0.61, 0.46), (0.04, 0.055, 0.065), scale_xy=1.10, configure_top_fn=config_bao_top
)


# ==============================================================================
# 5. MARCUS ("The Maniac")
# ==============================================================================
m_head, m_el, m_er = duplicate_pair("GEO-head_sculpting_realistic", "GEO-head_sculpting_realistic.sclera.L", "GEO-head_sculpting_realistic.sclera.R", "Marcus")
prepare_head_and_eyes(m_head, m_el, m_er, 1.0, +0.0158, +1.4511, multires_level=2, trim_to_neck=True)
for v in m_head.data.vertices:
    co = v.co
    ax = abs(co.x)
    if 1.60 < co.z < 1.67 and ax > 0.035:
        v.co.x *= 1.06
    if co.x > 0.010 and 1.645 < co.z < 1.670 and co.y < -0.110:
        w = min(1.0, (co.x - 0.010) / 0.018)
        v.co.z += 0.0025 * w
        v.co.y += 0.0012 * w

paint_head_skin(m_head, (0.66, 0.45, 0.32), (0.46, 0.24, 0.22), (0.08, 0.05, 0.035), lip_z=1.6561, lip_y=-0.1319, brow_z_base=1.741, stubble_strength=0.42, mat_name="MarcusSkin")
paint_eyes(m_el, m_er, (0.32, 0.18, 0.07), (0.15, 0.08, 0.03), "MarcusEyeMat")

m_hair = import_hair_mesh("rpm_female_1.glb", "MarcusHair")
bpy.context.view_layer.objects.active = m_hair
sub = m_hair.modifiers.new("Sub", 'SUBSURF'); sub.levels = 1; bpy.ops.object.modifier_apply(modifier="Sub")
for v in m_hair.data.vertices:
    v.co.x *= 1.04
    v.co.y = v.co.y * 1.02 + 0.008
    v.co.z = (v.co.z - 1.73) * 1.04 + 1.728
    if v.co.z > 1.74 and v.co.y < -0.02:
        quiff = max(0.0, min(1.0, (-0.02 - v.co.y) / 0.09)) * max(0.0, min(1.0, (v.co.z - 1.74) / 0.06))
        v.co.z += 0.022 * quiff
        v.co.y -= 0.006 * quiff
fit_hair_outside_scalp(m_hair, m_head, clearance=0.0038)
for p in m_hair.data.polygons: p.use_smooth = True
m_hair.data.materials.clear()
m_hair.data.materials.append(make_solid_mat("MarcusChestnutHair", (0.14, 0.07, 0.038), roughness=0.38))
m_hair.data.materials.append(make_solid_mat("MarcusAviatorGold", (0.92, 0.72, 0.22), roughness=0.15, metallic=0.94))
m_hair.data.materials.append(make_solid_mat("MarcusAviatorAmberLens", (0.65, 0.32, 0.05), roughness=0.04, coat=1.0, alpha=0.52))

bm = bmesh.new(); bm.from_mesh(m_hair.data)
ay = -0.130
for sx in (-1.0, 1.0):
    cx, cz = sx * 0.034, 1.716
    pts = []
    for k in range(16):
        ang = (k / 16.0) * 2 * math.pi
        rx = 0.024
        rz = 0.015 if math.sin(ang) > 0 else 0.019
        droop = -0.003 * max(0.0, -math.sin(ang)) * (1.0 + 0.4 * sx * math.cos(ang))
        pts.append(Vector((cx + rx * math.cos(ang), ay, cz + rz * math.sin(ang) + droop)))
    for k in range(16):
        add_box_beam(bm, pts[k], pts[(k + 1) % 16], 0.0014, 1)
    lv = [bm.verts.new(p) for p in pts]
    fl = bm.faces.new(lv); fl.material_index = 2
    add_box_beam(bm, Vector((cx + sx * 0.024, ay, cz + 0.006)), Vector((sx * 0.078, -0.015, cz + 0.004)), 0.0013, 1)
add_box_beam(bm, Vector((-0.014, ay - 0.001, 1.728)), Vector((0.014, ay - 0.001, 1.728)), 0.0013, 1)
add_box_beam(bm, Vector((-0.011, ay - 0.001, 1.721)), Vector((0.011, ay - 0.001, 1.721)), 0.0013, 1)
bm.to_mesh(m_hair.data); bm.free()

def config_marcus_top(t_obj):
    base_m_mat = t_obj.data.materials[0]
    mat_m_jacket = make_island_pbr_mat(base_m_mat, "MarcusBurgundyBlazerPBR", (0.28, 0.025, 0.048), ref_lum=0.48, min_factor=0.30)
    mat_m_vest   = make_island_pbr_mat(base_m_mat, "MarcusObsidianVestPBR",   (0.032, 0.032, 0.038), ref_lum=0.35, min_factor=0.30)
    mat_m_shirt  = make_island_pbr_mat(base_m_mat, "MarcusBlackSilkShirtPBR", (0.024, 0.024, 0.028), ref_lum=0.70, min_factor=0.30)
    mat_m_gold   = make_solid_mat("MarcusGoldChain", (0.92, 0.72, 0.22), roughness=0.16, metallic=0.94)
    t_obj.data.materials.clear()
    for m in [mat_m_jacket, mat_m_vest, mat_m_shirt, mat_m_gold]:
        t_obj.data.materials.append(m)
    assign_wedding_suit_islands(t_obj, 0, 1, 2, 3, delete_bowtie=True, open_collar=True)

m_top, m_hands, m_pants = import_and_pose_male_outfit(
    "readyplayer.me.glb", "Marcus", (0.66, 0.45, 0.32), (0.035, 0.032, 0.038), configure_top_fn=config_marcus_top
)
bm = bmesh.new(); bm.from_mesh(m_top.data)
chain_pts = []
for i in range(25):
    t = (i / 24.0) * 2.0 - 1.0
    cx = t * 0.044
    cz = 1.535 - 0.065 * (1.0 - t * t)
    cy = -0.072 - 0.036 * (1.0 - t * t)
    chain_pts.append(Vector((cx, cy, cz)))
for i in range(len(chain_pts) - 1):
    add_box_beam(bm, chain_pts[i], chain_pts[i+1], 0.0042, 3)
bm.to_mesh(m_top.data); bm.free()

# Remove template base meshes before rendering/splitting
for o in list(bpy.data.objects):
    if o.name in needed_base:
        bpy.data.objects.remove(o, do_unlink=True)

# ==============================================================================
# STEP 1: Render 5-Character Posed Verification Lineup Image
# ==============================================================================
char_groups = [
    (-0.74, [v_head, v_el, v_er, v_hair, v_top, v_hands, v_pants]),
    (-0.37, [d_head, d_el, d_er, d_hair, d_top, d_hands, d_pants]),
    (0.00,  [e_body, e_el, e_er, e_hair, e_gown]),
    (+0.37, [b_head, b_el, b_er, b_hair, b_top, b_hands, b_pants]),
    (+0.74, [m_head, m_el, m_er, m_hair, m_top, m_hands, m_pants]),
]
for dx, objs in char_groups:
    for o in objs:
        o.location.x += dx

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 1920
scene.render.resolution_y = 840
scene.render.filepath = f"{SCRATCH_DIR}/preview_5_realistic_characters_v4_posed.png"

world = bpy.data.worlds.new("W")
scene.world = world
bg = world.node_tree.nodes.get("Background")
bg.inputs[0].default_value = (0.07, 0.09, 0.12, 1.0)

lights_cams = []
for lname, loc, energy, size in [
    ("Key", (0.4, -2.0, 2.05), 115, 2.6),
    ("Fill", (-0.8, -2.0, 1.60), 55, 2.6),
    ("Rim", (0.0, 1.4, 2.20), 80, 2.2),
]:
    ld = bpy.data.lights.new(lname, type='AREA')
    ld.energy = energy; ld.size = size
    lo = bpy.data.objects.new(lname, ld)
    scene.collection.objects.link(lo)
    lo.location = loc
    lights_cams.append(lo)

cam_data = bpy.data.cameras.new("Cam")
cam_data.type = 'ORTHO'
cam_data.ortho_scale = 1.96
cam_obj = bpy.data.objects.new("Cam", cam_data)
scene.collection.objects.link(cam_obj)
cam_obj.location = (0.0, -2.2, 1.46)
cam_obj.rotation_euler = (math.radians(90.0), 0.0, 0.0)
scene.camera = cam_obj
lights_cams.append(cam_obj)

bpy.ops.render.render(write_still=True)
print("Rendered preview_5_realistic_characters_v4_posed.png")

# Restore X = 0 for all character objects and remove render lights/camera
for dx, objs in char_groups:
    for o in objs:
        o.location.x = 0.0
for lo in lights_cams:
    bpy.data.objects.remove(lo, do_unlink=True)


# ==============================================================================
# STEP 2: Split & Pivot Each Character into (<Role>_Torso, <Role>_Head, <Role>_LeftArm, <Role>_RightArm)
# ==============================================================================
def ensure_white_vcol_on_non_vcol_polys(mesh_obj):
    """
    In glTF 2.0 / Three.js, if a joined mesh has a COLOR_0 attribute, Three.js multiplies
    material.color by COLOR_0 on ALL primitives of that mesh!
    Ensure every polygon whose material does NOT have 'uses_vcol' == True has Col = (1, 1, 1, 1).
    """
    col_attr = mesh_obj.data.color_attributes.get("Col")
    if not col_attr:
        return
    for poly in mesh_obj.data.polygons:
        mat = mesh_obj.data.materials[poly.material_index] if poly.material_index < len(mesh_obj.data.materials) else None
        uses_vcol = bool(mat and mat.get("uses_vcol"))
        if not uses_vcol:
            for li in poly.loop_indices:
                col_attr.data[li].color = (1.0, 1.0, 1.0, 1.0)


def ensure_col_layer_before_join(objs):
    """If any object in objs has a 'Col' attribute, ensure all objects in objs have 'Col' initialized to (1,1,1,1)."""
    has_col = any(o.data.color_attributes.get("Col") is not None for o in objs)
    if not has_col:
        return
    for o in objs:
        if o.data.color_attributes.get("Col") is None:
            ca = o.data.color_attributes.new(name="Col", type='BYTE_COLOR', domain='CORNER')
            for i in range(len(ca.data)):
                ca.data[i].color = (1.0, 1.0, 1.0, 1.0)


def join_and_shift_pivot(objs, final_name, pivot_vec):
    """Joins objs into a single mesh named final_name and translates vertices by -pivot_vec with origin at (0,0,0)."""
    ensure_col_layer_before_join(objs)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.location = (0.0, 0.0, 0.0)
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = final_name
    joined.data.name = f"{final_name}_Mesh"
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for v in joined.data.vertices:
        v.co -= pivot_vec
    joined.data.update()
    ensure_white_vcol_on_non_vcol_polys(joined)
    joined.select_set(False)
    return joined


def split_male_character_into_4_parts(prefix, head_obj, eye_l, eye_r, hair_obj, top_obj, hands_obj, pants_obj, head_y, shoulder_x, arm_y, has_left_watch=False, has_right_ring=False):
    z_ref = 1.635 - head_y
    y_ref = -0.025
    p_torso = Vector((0.0, y_ref, z_ref))
    p_head = Vector((0.0, y_ref, 1.635))
    p_left_arm = Vector((-shoulder_x, y_ref + 0.01, z_ref + arm_y))   # X < 0 arm in Three.js
    p_right_arm = Vector((+shoulder_x, y_ref + 0.01, z_ref + arm_y))  # X > 0 arm in Three.js

    # 1. Head
    final_head = join_and_shift_pivot([head_obj, eye_l, eye_r, hair_obj], f"{prefix}_Head", p_head)

    # 2. Partition top_obj into Torso, LeftArm (X < 0, RightArm bone), RightArm (X > 0, LeftArm bone)
    r_vgs = {g.index for g in top_obj.vertex_groups if g.name.startswith("RightArm") or g.name.startswith("RightForeArm") or g.name.startswith("RightHand")}
    l_vgs = {g.index for g in top_obj.vertex_groups if g.name.startswith("LeftArm") or g.name.startswith("LeftForeArm") or g.name.startswith("LeftHand")}

    def extract_poly_subset(src_obj, keep_fn, part_name):
        cp = src_obj.copy()
        cp.data = src_obj.data.copy()
        bpy.context.scene.collection.objects.link(cp)
        cp.name = part_name
        bm_sub = bmesh.new()
        bm_sub.from_mesh(cp.data)
        bm_sub.faces.ensure_lookup_table()
        del_f = [f for i, f in enumerate(bm_sub.faces) if not keep_fn(i, f)]
        bmesh.ops.delete(bm_sub, geom=del_f, context='FACES')
        del_v = [v for v in bm_sub.verts if len(v.link_faces) == 0]
        bmesh.ops.delete(bm_sub, geom=del_v, context='VERTS')
        bm_sub.to_mesh(cp.data)
        bm_sub.free()
        return cp

    def poly_arm_weights(poly_idx):
        poly = top_obj.data.polygons[poly_idx]
        w_r = 0.0
        w_l = 0.0
        for vi in poly.vertices:
            for g in top_obj.data.vertices[vi].groups:
                if g.group in r_vgs:
                    w_r += g.weight
                elif g.group in l_vgs:
                    w_l += g.weight
        w_r /= len(poly.vertices)
        w_l /= len(poly.vertices)
        c = poly.center
        if c.y < -0.20 and c.z < 1.15:
            return (0.0, 0.0)
        return (w_r, w_l)

    poly_wl = [poly_arm_weights(i) for i in range(len(top_obj.data.polygons))]
    top_torso = extract_poly_subset(top_obj, lambda i, f: poly_wl[i][0] < 0.56 and poly_wl[i][1] < 0.56, f"{prefix}_TopTorso")
    top_l_arm = extract_poly_subset(top_obj, lambda i, f: poly_wl[i][0] >= 0.36, f"{prefix}_TopLArm")
    top_r_arm = extract_poly_subset(top_obj, lambda i, f: poly_wl[i][1] >= 0.36, f"{prefix}_TopRArm")
    # Gently tuck the overlap cuff on top_torso inward by 1.8mm so rotated arms glide smoothly over the shoulder socket without z-fighting or gaps
    for v in top_torso.data.vertices:
        if abs(v.co.x) > 0.135 and v.co.z > 1.32:
            v.co -= v.normal * 0.0018
    top_torso.data.update()
    bpy.data.objects.remove(top_obj, do_unlink=True)

    # Partition hands_obj into LeftArm (x < 0) and RightArm (x >= 0)
    hands_l = extract_poly_subset(hands_obj, lambda i, f: f.calc_center_median().x < 0.0, f"{prefix}_HandsL")
    hands_r = extract_poly_subset(hands_obj, lambda i, f: f.calc_center_median().x >= 0.0, f"{prefix}_HandsR")
    bpy.data.objects.remove(hands_obj, do_unlink=True)

    # Optional luxury gold wristwatch on LeftArm (X < 0) wrist
    if has_left_watch:
        gold_m = make_solid_mat(f"{prefix}WristWatchGold", (0.92, 0.74, 0.22), roughness=0.16, metallic=0.94)
        hands_l.data.materials.append(gold_m)
        gold_idx = len(hands_l.data.materials) - 1
        w_center = sum((v.co for v in hands_l.data.vertices), Vector()) / max(1, len(hands_l.data.vertices))
        bm_w = bmesh.new(); bm_w.from_mesh(hands_l.data)
        bmesh.ops.create_uvsphere(
            bm_w, u_segments=18, v_segments=12, radius=0.028,
            matrix=Matrix.Translation(w_center + Vector((-0.015, 0.045, 0.012))) @ Matrix.Diagonal((1.05, 0.45, 0.85, 1.0))
        )
        for f in bm_w.faces:
            if (f.calc_center_median() - (w_center + Vector((-0.015, 0.045, 0.012)))).length < 0.035:
                f.material_index = gold_idx
        bm_w.to_mesh(hands_l.data); bm_w.free()

    final_torso = join_and_shift_pivot([top_torso, pants_obj], f"{prefix}_Torso", p_torso)
    final_l_arm = join_and_shift_pivot([top_l_arm, hands_l], f"{prefix}_LeftArm", p_left_arm)
    final_r_arm = join_and_shift_pivot([top_r_arm, hands_r], f"{prefix}_RightArm", p_right_arm)
    return [final_torso, final_head, final_l_arm, final_r_arm]


def split_elena_into_4_parts(body_obj, eye_l, eye_r, hair_obj, gown_obj, head_y=0.54, shoulder_x=0.132, arm_y=0.36):
    z_ref = 1.635 - head_y
    y_ref = -0.025
    p_torso = Vector((0.0, y_ref, z_ref))
    p_head = Vector((0.0, y_ref, 1.635))
    p_left_arm = Vector((-shoulder_x, y_ref + 0.01, z_ref + arm_y))   # X < 0
    p_right_arm = Vector((+shoulder_x, y_ref + 0.01, z_ref + arm_y))  # X > 0

    fs_attr = body_obj.data.attributes.get(".sculpt_face_set")
    head_fs = {17, 22, 2, 3, 4, 5, 7, 8}
    l_arm_fs = {20, 11, 10, *range(84, 104)}  # X < 0 bare arm + 5-finger hand
    r_arm_fs = {21, 12, 9, *range(64, 84)}    # X > 0 bare arm + 5-finger hand

    def extract_elena_part(valid_fs, part_name):
        cp = body_obj.copy()
        cp.data = body_obj.data.copy()
        bpy.context.scene.collection.objects.link(cp)
        cp.name = part_name
        fs_a = cp.data.attributes.get(".sculpt_face_set")
        bm_s = bmesh.new()
        bm_s.from_mesh(cp.data)
        bm_s.faces.ensure_lookup_table()
        del_f = [f for i, f in enumerate(bm_s.faces) if fs_a and fs_a.data[i].value not in valid_fs]
        bmesh.ops.delete(bm_s, geom=del_f, context='FACES')
        del_v = [v for v in bm_s.verts if len(v.link_faces) == 0]
        bmesh.ops.delete(bm_s, geom=del_v, context='VERTS')
        bm_s.to_mesh(cp.data)
        bm_s.free()
        return cp

    e_head_mesh = extract_elena_part(head_fs, "Elena_HeadSkin")
    e_torso_skin = extract_elena_part({1, 18, 19}, "Elena_TorsoSkin")
    e_l_arm_mesh = extract_elena_part(l_arm_fs, "Elena_LArmSkin")
    e_r_arm_mesh = extract_elena_part(r_arm_fs, "Elena_RArmSkin")
    bpy.data.objects.remove(body_obj, do_unlink=True)

    # Add 18K Gold Bangle Bracelet on Elena's RightArm (X > 0) wrist
    gold_bangle = make_solid_mat("ElenaWristBangleGold", (0.92, 0.74, 0.22), roughness=0.16, metallic=0.94)
    e_r_arm_mesh.data.materials.append(gold_bangle)
    bangle_idx = len(e_r_arm_mesh.data.materials) - 1
    bm_b = bmesh.new(); bm_b.from_mesh(e_r_arm_mesh.data)
    bmesh.ops.create_uvsphere(
        bm_b, u_segments=20, v_segments=12, radius=0.025,
        matrix=Matrix.Translation((0.118, -0.145, 1.210)) @ Matrix.Diagonal((1.05, 0.35, 0.88, 1.0))
    )
    for f in bm_b.faces:
        if (f.calc_center_median() - Vector((0.118, -0.145, 1.210))).length < 0.032:
            f.material_index = bangle_idx
    bm_b.to_mesh(e_r_arm_mesh.data); bm_b.free()

    final_head = join_and_shift_pivot([e_head_mesh, eye_l, eye_r, hair_obj], "Elena_Head", p_head)
    final_torso = join_and_shift_pivot([e_torso_skin, gown_obj], "Elena_Torso", p_torso)
    final_l_arm = join_and_shift_pivot([e_l_arm_mesh], "Elena_LeftArm", p_left_arm)
    final_r_arm = join_and_shift_pivot([e_r_arm_mesh], "Elena_RightArm", p_right_arm)
    return [final_torso, final_head, final_l_arm, final_r_arm]


dealer_parts = split_male_character_into_4_parts(
    "Dealer", d_head, d_el, d_er, d_hair, d_top, d_hands, d_pants,
    head_y=0.61, shoulder_x=0.175, arm_y=0.39
)

viktor_parts = split_male_character_into_4_parts(
    "Viktor", v_head, v_el, v_er, v_hair, v_top, v_hands, v_pants,
    head_y=0.54, shoulder_x=0.155, arm_y=0.36, has_left_watch=True
)

elena_parts = split_elena_into_4_parts(
    e_body, e_el, e_er, e_hair, e_gown,
    head_y=0.54, shoulder_x=0.132, arm_y=0.36
)

bao_parts = split_male_character_into_4_parts(
    "Bao", b_head, b_el, b_er, b_hair, b_top, b_hands, b_pants,
    head_y=0.54, shoulder_x=0.195, arm_y=0.36
)

marcus_parts = split_male_character_into_4_parts(
    "Marcus", m_head, m_el, m_er, m_hair, m_top, m_hands, m_pants,
    head_y=0.54, shoulder_x=0.155, arm_y=0.36, has_left_watch=True
)

# ==============================================================================
# STEP 3: Export /models/vip_dealer.glb and /models/vip_ai_players.glb
# ==============================================================================
bpy.ops.object.select_all(action='DESELECT')
for o in dealer_parts:
    o.select_set(True)
dealer_glb_path = os.path.join(OUT_DIR, "vip_dealer.glb")
bpy.ops.export_scene.gltf(
    filepath=dealer_glb_path,
    export_format='GLB',
    use_selection=True,
    export_apply=True,
)
print(f"Exported {dealer_glb_path} ({os.path.getsize(dealer_glb_path)} bytes)")

bpy.ops.object.select_all(action='DESELECT')
for o in (viktor_parts + elena_parts + bao_parts + marcus_parts):
    o.select_set(True)
ai_glb_path = os.path.join(OUT_DIR, "vip_ai_players.glb")
bpy.ops.export_scene.gltf(
    filepath=ai_glb_path,
    export_format='GLB',
    use_selection=True,
    export_apply=True,
)
print(f"Exported {ai_glb_path} ({os.path.getsize(ai_glb_path)} bytes)")
