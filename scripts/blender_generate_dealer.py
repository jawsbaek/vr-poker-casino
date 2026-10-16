"""
Headless Blender 5.2 Realistic Character Generator — Monte Carlo VIP Dealer
Builds `public/models/vip_dealer.glb` directly from Blender Studio's official
`human_base_meshes_bundle.blend` (`GEO-body_male_realistic` at multires level 2)
and ReadyPlayerMe's tailored tuxedo & hair assets (`readyplayer.me.glb`, `rpm_pulkit.glb`),
matching the exact 5-character lineup from `preview_all_5_characters.py`.

Exported root hierarchy (1:1 with CasinoScene.ts):
  - Dealer_Torso     (origin at dealerGroup 0,0,0 -> world 0, 0.75, -1.14)
  - Dealer_Head      (origin at dealerHeadGroup 0, 0.61, 0)
  - Dealer_LeftArm   (origin at dealerLeftArm -0.175, 0.39, -0.01)
  - Dealer_RightArm  (origin at dealerRightArm +0.175, 0.39, -0.01)

Run via:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/blender_generate_dealer.py
"""

import bpy
import bmesh
import math
import os
from mathutils import Vector, Matrix

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PBR_DIR = os.path.join(PROJECT_ROOT, "public", "assets", "pbr")
OUT_DIR = os.path.join(PROJECT_ROOT, "public", "models")
SCRATCH_MODELS_DIR = "/Users/User/.gemini/antigravity/brain/b066b21e-03c2-4c92-b3fb-02f35779ebb2/scratch/models"

os.makedirs(PBR_DIR, exist_ok=True)
os.makedirs(OUT_DIR, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=os.path.join(SCRATCH_MODELS_DIR, "human_base_meshes_bundle.blend"))

needed_base = {
    "GEO-body_male_realistic",
    "GEO-body_male_realistic.eye.L",
    "GEO-body_male_realistic.eye.R",
}
for o in list(bpy.data.objects):
    if o.name not in needed_base:
        bpy.data.objects.remove(o, do_unlink=True)
    else:
        o.hide_render = False
        o.hide_viewport = False
        if o.name not in bpy.context.scene.collection.objects:
            bpy.context.scene.collection.objects.link(o)

robj = bpy.data.objects["GEO-body_male_realistic"]
robj.location = (0.0, 0.0, 0.0)
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
for en in ["GEO-body_male_realistic.eye.L", "GEO-body_male_realistic.eye.R"]:
    bpy.data.objects[en].select_set(True)
bpy.context.view_layer.objects.active = bpy.data.objects["GEO-body_male_realistic.eye.L"]
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
robj.select_set(True)
bpy.context.view_layer.objects.active = robj
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def duplicate_pair(root_name, eye_l_name, eye_r_name, prefix):
    src_r = bpy.data.objects[root_name]
    src_el = bpy.data.objects[eye_l_name]
    src_er = bpy.data.objects[eye_r_name]
    nr = src_r.copy(); nr.data = src_r.data.copy(); nr.name = f"{prefix}_HeadMesh"
    nel = src_el.copy(); nel.data = src_el.data.copy(); nel.name = f"{prefix}_EyeL"
    ner = src_er.copy(); ner.data = src_er.data.copy(); ner.name = f"{prefix}_EyeR"
    for o in [nr, nel, ner]:
        bpy.context.scene.collection.objects.link(o)
    return nr, nel, ner


def clear_color_attributes(mesh):
    while len(mesh.color_attributes) > 0:
        mesh.color_attributes.remove(mesh.color_attributes[0])


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
        fs_attr = head_obj.data.attributes.get(".sculpt_face_set")
        vert_fs = {}
        if fs_attr:
            for pi, poly in enumerate(head_obj.data.polygons):
                val = fs_attr.data[pi].value
                for vi in poly.vertices:
                    vert_fs[vi] = val
        bm = bmesh.new()
        bm.from_mesh(head_obj.data)
        to_del = []
        for v in bm.verts:
            co = v.co * scale + Vector((0.0, dy, dz))
            v.co = co
            fs = vert_fs.get(v.index, 0)
            if co.z < 1.48 or abs(co.x) > 0.115 or fs == 3:
                to_del.append(v)
        bmesh.ops.delete(bm, geom=to_del, context='VERTS')
        geom_all = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom_all, plane_co=(0.0, 0.0, 1.515), plane_no=(0.0, 0.0, 1.0), clear_inner=True)
        for v in bm.verts:
            co = v.co.copy()
            if co.z < 1.605:
                t = max(0.0, min(1.0, (1.605 - co.z) / 0.090))
                t_smooth = t * t * (3.0 - 2.0 * t)
                co.x *= (1.0 - 0.44 * t_smooth)
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
        clear_color_attributes(e.data)
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
                    er, eg, eb = 0.85, 0.82, 0.80
                ecol.data[li].color = (er, eg, eb, 1.0)
    eye_mat = bpy.data.materials.new(mat_name)
    eye_mat.use_nodes = True
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


def paint_head_skin(head_obj, base_rgb, lip_rgb, brow_rgb, lip_z, lip_y, brow_z_base, stubble_strength=0.0, beard_strength=0.0, mat_name="SkinMat"):
    clear_color_attributes(head_obj.data)
    color_attr = head_obj.data.color_attributes.new(name="Col", type='BYTE_COLOR', domain='CORNER')
    for poly in head_obj.data.polygons:
        for li in poly.loop_indices:
            vi = head_obj.data.loops[li].vertex_index
            co = head_obj.data.vertices[vi].co
            r, g, b = base_rgb
            if co.z > 1.45:
                ax = abs(co.x)
                # Cheek warmth
                cheek_d2 = ((ax - 0.046) / 0.032)**2 + ((co.y + 0.105) / 0.035)**2 + ((co.z - 1.685) / 0.028)**2
                if cheek_d2 < 4.0:
                    w = 0.24 * math.exp(-cheek_d2)
                    r = r * (1 - w) + (base_rgb[0] * 1.03) * w
                    g = g * (1 - w) + (base_rgb[1] * 0.76) * w
                    b = b * (1 - w) + (base_rgb[2] * 0.78) * w
                # Nose warmth
                nose_d2 = (ax / 0.020)**2 + ((co.y + 0.140) / 0.024)**2 + ((co.z - 1.688) / 0.024)**2
                if nose_d2 < 4.0:
                    w = 0.20 * math.exp(-nose_d2)
                    r = r * (1 - w) + (base_rgb[0] * 1.02) * w
                    g = g * (1 - w) + (base_rgb[1] * 0.80) * w
                    b = b * (1 - w) + (base_rgb[2] * 0.80) * w
                # Lips
                if co.y < -0.100 and (lip_z - 0.018) < co.z < (lip_z + 0.018) and ax < 0.032:
                    lip_d2 = (ax / 0.023)**2 + ((co.z - lip_z) / 0.0082)**2 + ((co.y - lip_y) / 0.016)**2
                    if lip_d2 < 3.5:
                        w = 0.82 * math.exp(-lip_d2 * 1.15)
                        r = r * (1 - w) + lip_rgb[0] * w
                        g = g * (1 - w) + lip_rgb[1] * w
                        b = b * (1 - w) + lip_rgb[2] * w
                # Eyelash / eyelid crease shadow around eye_z = 1.719
                eye_d2 = ((ax - 0.033) / 0.016)**2 + ((co.z - 1.719) / 0.0085)**2 + ((co.y + 0.095) / 0.018)**2
                if eye_d2 < 3.5:
                    w = 0.52 * math.exp(-eye_d2 * 1.2)
                    r = r * (1 - w) + brow_rgb[0] * w
                    g = g * (1 - w) + brow_rgb[1] * w
                    b = b * (1 - w) + brow_rgb[2] * w
                # Eyebrows (smooth Gaussian arch)
                if 0.012 < ax < 0.057 and co.y < -0.095:
                    brow_z = brow_z_base + 0.12 * (ax - 0.015) - 3.0 * max(0.0, ax - 0.039)**2
                    dz_b = (co.z - brow_z) / 0.0046
                    dx_taper = max(0.0, min(1.0, (ax - 0.013) / 0.006)) * max(0.0, min(1.0, (0.056 - ax) / 0.009))
                    if abs(dz_b) < 2.5:
                        bw = 0.85 * math.exp(-dz_b * dz_b * 1.1) * dx_taper
                        r = r * (1 - bw) + brow_rgb[0] * bw
                        g = g * (1 - bw) + brow_rgb[1] * bw
                        b = b * (1 - bw) + brow_rgb[2] * bw
                # Smooth Groomed Short Beard or Stubble
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
                    bw = min(0.90, w_total * strength * strand)
                    r = r * (1 - bw) + brow_rgb[0] * bw
                    g = g * (1 - bw) + brow_rgb[1] * bw
                    b = b * (1 - bw) + brow_rgb[2] * bw

            color_attr.data[li].color = (r, g, b, 1.0)

    smat = bpy.data.materials.new(mat_name)
    smat.use_nodes = True
    sbsdf = smat.node_tree.nodes.get("Principled BSDF")
    svcol = smat.node_tree.nodes.new("ShaderNodeVertexColor")
    svcol.layer_name = "Col"
    smat.node_tree.links.new(svcol.outputs["Color"], sbsdf.inputs["Base Color"])
    sbsdf.inputs["Roughness"].default_value = 0.45
    if "Specular IOR Level" in sbsdf.inputs:
        sbsdf.inputs["Specular IOR Level"].default_value = 0.32
    if "Subsurface Weight" in sbsdf.inputs:
        sbsdf.inputs["Subsurface Weight"].default_value = 0.02 if beard_strength > 0.5 else 0.14
    head_obj.data.materials.clear()
    head_obj.data.materials.append(smat)
    return smat


def import_hair_mesh(glb_filename, new_name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SCRATCH_MODELS_DIR, glb_filename))
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


def import_top_mesh(glb_filename, new_name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SCRATCH_MODELS_DIR, glb_filename))
    after = set(bpy.data.objects) - before
    t_obj = None
    for o in after:
        if o.name.startswith("Wolf3D_Outfit_Top"):
            t_obj = o
            break
    if t_obj:
        bpy.ops.object.select_all(action='DESELECT')
        t_obj.select_set(True)
        bpy.context.view_layer.objects.active = t_obj
        bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
        t_obj.modifiers.clear()
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        t_obj.name = new_name
    for o in list(after):
        if o != t_obj:
            bpy.data.objects.remove(o, do_unlink=True)
    return t_obj


def clone_and_recolor_pbr_mat(src_mat, new_name, pixel_transform_fn):
    m = src_mat.copy()
    m.name = new_name
    for n in m.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image and ("top-D" in n.image.name or "bottom-D" in n.image.name):
            new_img = n.image.copy()
            new_img.name = f"{new_name}_D"
            if new_img.packed_file:
                new_img.unpack(method='REMOVE')
            px = list(new_img.pixels)
            for i in range(0, len(px), 4):
                r, g, b, a = px[i], px[i+1], px[i+2], px[i+3]
                nr, ng, nb = pixel_transform_fn(r, g, b)
                px[i], px[i+1], px[i+2] = nr, ng, nb
            new_img.pixels[:] = px
            new_img.update()
            out_png = os.path.join(PBR_DIR, f"{new_name}_D.png")
            new_img.filepath_raw = out_png
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


def make_solid_mat(name, rgb, roughness=0.4, metallic=0.0, coat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Coat Weight" in bsdf.inputs and coat > 0:
        bsdf.inputs["Coat Weight"].default_value = coat
    return m


def assign_wedding_suit_islands(top_obj, mat_jacket_idx, mat_vest_idx, mat_shirt_idx, mat_btn_idx, mat_bowtie_idx=None, delete_bowtie=True):
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
        else:
            m_idx = mat_jacket_idx
        for c in comp:
            for f in c.link_faces:
                f.material_index = m_idx
    bmesh.ops.delete(bm, geom=to_del, context='VERTS')
    bm.to_mesh(top_obj.data); bm.free()


def shift_mesh_vertices(obj, delta_vec):
    for v in obj.data.vertices:
        v.co += delta_vec
    obj.data.update()


def add_tiny_anchor_mesh(name, parent, mat):
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    v0 = bm.verts.new((0.0, 0.0, 0.0))
    v1 = bm.verts.new((0.0005, 0.0, 0.0))
    v2 = bm.verts.new((0.0, 0.0005, 0.0))
    bm.faces.new((v0, v1, v2))
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    obj.parent = parent
    return obj


# ==============================================================================
# BUILD DEALER (Monte Carlo VIP Croupier)
# ==============================================================================
d_head, d_el, d_er = duplicate_pair("GEO-body_male_realistic", "GEO-body_male_realistic.eye.L", "GEO-body_male_realistic.eye.R", "Dealer")
prepare_head_and_eyes(d_head, d_el, d_er, 1.0, +0.0206, +0.0420, multires_level=2, trim_to_neck=True)
for v in d_head.data.vertices:
    ax = abs(v.co.x)
    if 1.63 < v.co.z < 1.71 and v.co.y < -0.05:
        v.co.x *= 1.035
    if 0.015 < ax < 0.032 and 1.652 < v.co.z < 1.672 and v.co.y < -0.105:
        v.co.z += 0.0022 * ((ax - 0.015) / 0.017)

paint_head_skin(
    d_head,
    (0.77, 0.58, 0.47),
    (0.54, 0.30, 0.28),
    (0.035, 0.025, 0.020),
    lip_z=1.6610,
    lip_y=-0.1246,
    brow_z_base=1.741,
    beard_strength=0.98,
    mat_name="DealerSkin",
)
paint_eyes(d_el, d_er, (0.44, 0.28, 0.12), (0.22, 0.14, 0.06), "DealerEyeMat")

d_hair = import_hair_mesh("rpm_pulkit.glb", "DealerHair")
clear_color_attributes(d_hair.data)
bpy.context.view_layer.objects.active = d_hair
sub = d_hair.modifiers.new("Sub", 'SUBSURF'); sub.levels = 1; bpy.ops.object.modifier_apply(modifier="Sub")
for v in d_hair.data.vertices:
    v.co.x = -v.co.x * 1.03
    v.co.y = v.co.y * 1.04 + 0.006
    v.co.z = (v.co.z - 1.73) * 0.99 + 1.725
bm = bmesh.new(); bm.from_mesh(d_hair.data); bmesh.ops.reverse_faces(bm, faces=bm.faces); bm.to_mesh(d_hair.data); bm.free()
for p in d_hair.data.polygons: p.use_smooth = True
d_hair.data.materials.clear()
d_hair.data.materials.append(make_solid_mat("DealerHairMat", (0.04, 0.030, 0.025), roughness=0.40))

d_top = import_top_mesh("readyplayer.me.glb", "DealerTop")
clear_color_attributes(d_top.data)
base_d_mat = d_top.data.materials[0]
mat_d_jacket = make_island_pbr_mat(base_d_mat, "DealerJacketPBR", (0.038, 0.038, 0.045), ref_lum=0.48, min_factor=0.28)
mat_d_vest   = make_island_pbr_mat(base_d_mat, "DealerVestPBR",   (0.025, 0.025, 0.030), ref_lum=0.35, min_factor=0.28)
mat_d_shirt  = make_island_pbr_mat(base_d_mat, "DealerShirtPBR",  (0.94, 0.95, 0.98), ref_lum=0.70, min_factor=0.74)
mat_d_gold   = make_solid_mat("DealerGold", (0.88, 0.68, 0.20), roughness=0.22, metallic=0.88)
d_top.data.materials.clear()
for m in [mat_d_jacket, mat_d_vest, mat_d_shirt, mat_d_gold]:
    d_top.data.materials.append(m)

assign_wedding_suit_islands(d_top, 0, 1, 2, 3, mat_bowtie_idx=3, delete_bowtie=False)
for p in d_top.data.polygons: p.use_smooth = True

# Remove source base meshes before parenting and exporting
for o in list(bpy.data.objects):
    if o.name in needed_base:
        bpy.data.objects.remove(o, do_unlink=True)

# Parent into CasinoScene.ts articulated hierarchy:
# dealerGroup is at (0, 0.75, -1.14); dealerHeadGroup is at (0, 0.61, 0).
# Using z_torso_ref = 1.08 and z_head_ref = 1.08 + 0.61 = 1.69 keeps Head & Torso 100% seamless!
torso_root = bpy.data.objects.new("Dealer_Torso", None)
head_root = bpy.data.objects.new("Dealer_Head", None)
left_arm_root = bpy.data.objects.new("Dealer_LeftArm", None)
right_arm_root = bpy.data.objects.new("Dealer_RightArm", None)
for r in [torso_root, head_root, left_arm_root, right_arm_root]:
    bpy.context.scene.collection.objects.link(r)

shift_mesh_vertices(d_top, Vector((0.0, +0.02, -1.08)))
d_top.parent = torso_root

for h_part in [d_head, d_el, d_er, d_hair]:
    shift_mesh_vertices(h_part, Vector((0.0, +0.02, -1.69)))
    h_part.parent = head_root

add_tiny_anchor_mesh("Dealer_LeftArm_Anchor", left_arm_root, mat_d_jacket)
add_tiny_anchor_mesh("Dealer_RightArm_Anchor", right_arm_root, mat_d_jacket)

out_file = os.path.join(OUT_DIR, "vip_dealer.glb")
bpy.ops.export_scene.gltf(
    filepath=out_file,
    export_format='GLB',
    export_apply=True,
    export_materials='EXPORT',
    export_color_attributes=True,
    export_yup=True,
)
print(f"[Blender 5.2] Successfully exported realistic VIP Dealer to: {out_file}")
