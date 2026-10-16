"""
Headless Blender 3D Asset & Ergonomics Generator for Apple Vision Pro (visionOS)
Generates:
1. public/models/vip_poker_table.usdz (Native Apple Vision Pro AR QuickLook 3D Table Diorama)
2. public/models/vip_poker_table.glb  (Standard glTF 2.0 PBR asset)
3. public/models/vision_pro_ergonomics_report.json (1:1 Meter Spatial Ergonomics Verification)

Run via:
  /Users/User/.local/bin/blender -b -P scripts/blender_generate_vip_assets.py
"""

import bpy
import bmesh
import math
import json
import os


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def create_pbr_material(name, base_color, roughness=0.4, metallic=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
    return mat


def build_vip_poker_table():
    # 1. Materials matching our Three.js VIP Luxury Casino palette
    mat_felt = create_pbr_material("EmeraldFelt", (0.039, 0.239, 0.141), roughness=0.78, metallic=0.02)
    mat_mahogany = create_pbr_material("MahoganyRim", (0.165, 0.078, 0.055), roughness=0.22, metallic=0.08)
    mat_brass = create_pbr_material("AntiqueBrass", (0.831, 0.686, 0.216), roughness=0.25, metallic=0.88)
    mat_pedestal = create_pbr_material("DarkWalnutPedestal", (0.09, 0.05, 0.04), roughness=0.45, metallic=0.1)
    mat_card = create_pbr_material("PlayingCardIvory", (0.97, 0.98, 0.99), roughness=0.35, metallic=0.02)

    chip_mats = {
        1: create_pbr_material("Chip_1_White", (0.94, 0.95, 0.96), roughness=0.38, metallic=0.05),
        5: create_pbr_material("Chip_5_Red", (0.86, 0.15, 0.15), roughness=0.38, metallic=0.05),
        25: create_pbr_material("Chip_25_Emerald", (0.06, 0.72, 0.50), roughness=0.38, metallic=0.05),
        100: create_pbr_material("Chip_100_ObsidianGold", (0.10, 0.12, 0.16), roughness=0.28, metallic=0.35),
    }

    # Note: In Blender Z is Up. USDZ / glTF exporters automatically convert +Z Up to +Y Up for Vision Pro!
    table_height = 0.75

    # 2. Central Pedestal Base
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.46, depth=0.72, location=(0, 0, 0.36))
    pedestal = bpy.context.active_object
    pedestal.name = "TablePedestal"
    pedestal.scale = (1.35, 0.95, 1.0)
    bpy.ops.object.transform_apply(scale=True)
    pedestal.data.materials.append(mat_pedestal)

    # Brass Foot Rail
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.58, minor_radius=0.022, major_segments=48, minor_segments=16, location=(0, 0, 0.10)
    )
    foot_rail = bpy.context.active_object
    foot_rail.name = "BrassFootRail"
    foot_rail.scale = (1.32, 0.95, 1.0)
    bpy.ops.object.transform_apply(scale=True)
    foot_rail.data.materials.append(mat_brass)

    # 3. Emerald Felt Playing Surface (Oval 2.36m x 1.66m at Z = 0.75m)
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=1.0, depth=0.04, location=(0, 0, table_height - 0.01))
    felt = bpy.context.active_object
    felt.name = "EmeraldFeltBed"
    felt.scale = (1.18, 0.83, 1.0)
    bpy.ops.object.transform_apply(scale=True)
    felt.data.materials.append(mat_felt)

    # 4. Luxury Padded Mahogany Armrest Rim
    bpy.ops.mesh.primitive_torus_add(
        major_radius=1.05, minor_radius=0.095, major_segments=64, minor_segments=24, location=(0, 0, table_height + 0.02)
    )
    rim = bpy.context.active_object
    rim.name = "MahoganyArmrestRim"
    rim.scale = (1.22, 0.88, 0.72)
    bpy.ops.object.transform_apply(scale=True)
    rim.data.materials.append(mat_mahogany)

    # 5. Inner Golden Betting Ring & Brass Cup Holders (5 Seats)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.14, minor_radius=0.004, major_segments=48, minor_segments=12, location=(0, -0.43, table_height + 0.012)
    )
    bet_ring = bpy.context.active_object
    bet_ring.name = "GoldenBettingRing_Seat0"
    bet_ring.data.materials.append(mat_brass)

    seat_coords = [
        (0.0, -0.68),     # Seat 0 (Human VIP)
        (1.02, -0.32),    # Seat 1 (Viktor)
        (0.72, 0.50),     # Seat 2 (Elena)
        (-0.72, 0.50),    # Seat 3 (Bao)
        (-1.02, -0.32),   # Seat 4 (Marcus)
    ]

    for idx, (sx, sy) in enumerate(seat_coords):
        # Brass Cup Holder on Rim
        cup_x = sx * 1.15 + (0.22 if idx == 0 else 0.14)
        cup_y = sy * 1.15
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=32, radius=0.044, depth=0.03, location=(cup_x, cup_y, table_height + 0.065)
        )
        cup = bpy.context.active_object
        cup.name = f"BrassCupHolder_Seat{idx}"
        cup.data.materials.append(mat_brass)

        # 2 Hole Cards per Seat
        for c_idx in range(2):
            offset_x = -0.048 if c_idx == 0 else 0.048
            bpy.ops.mesh.primitive_cube_add(
                size=1.0,
                location=(sx + offset_x, sy, table_height + 0.012 + c_idx * 0.001),
            )
            card = bpy.context.active_object
            card.name = f"HoleCard_Seat{idx}_{c_idx}"
            card.scale = (0.086, 0.122, 0.0012)
            bpy.ops.object.transform_apply(scale=True)
            card.data.materials.append(mat_card)

    # 6. Community Cards (5 cards on center board)
    for c_idx in range(5):
        cx = (c_idx - 2) * 0.14
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=(cx, 0.06, table_height + 0.012),
        )
        comm_card = bpy.context.active_object
        comm_card.name = f"CommunityCard_{c_idx}"
        comm_card.scale = (0.086, 0.122, 0.0012)
        bpy.ops.object.transform_apply(scale=True)
        comm_card.data.materials.append(mat_card)

    # 7. Seat #0 Physical Chip Stacks (4 Denominations: $1, $5, $25, $100 in 10-chip columns)
    denoms = [1, 5, 25, 100]
    for d_idx, denom in enumerate(denoms):
        stack_x = (d_idx - 1.5) * 0.068
        stack_y = -0.79
        for r in range(8):
            bpy.ops.mesh.primitive_cylinder_add(
                vertices=32,
                radius=0.020,
                depth=0.0038,
                location=(stack_x, stack_y, table_height + 0.013 + r * 0.0042),
            )
            chip = bpy.context.active_object
            chip.name = f"Chip_{denom}_{r}"
            chip.data.materials.append(chip_mats[denom])


def compute_ergonomics_report():
    """
    Computes 1:1 meter spatial ergonomics metrics for Apple Vision Pro seated play.
    """
    eye_pos = (0.0, -1.32, 1.42)
    hole_cards_pos = (0.0, -0.68, 0.763)
    betting_ring_pos = (0.0, -0.43, 0.763)
    bank_chips_pos = (0.0, -0.79, 0.763)
    spatial_hud_pos = (0.0, -0.86, 0.805)

    def dist3d(a, b):
        return round(math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(3))), 3)

    def pitch_deg(eye, target):
        dy = target[1] - eye[1]
        dz = target[2] - eye[2]
        return round(math.degrees(math.atan2(dz, dy)), 1)

    return {
        "targetDevice": "Apple Vision Pro (visionOS Safari WebXR + AR QuickLook)",
        "unitScale": "1.0 unit = 1.0 meter (local-floor reference space)",
        "seatedEyePositionMeters": {"x": 0.0, "y": 1.42, "z": 1.32},
        "tableFeltHeightMeters": 0.76,
        "ergonomicZones": {
            "bankChipStacks": {
                "distanceFromEyesMeters": dist3d(eye_pos, bank_chips_pos),
                "gazePitchDegrees": pitch_deg(eye_pos, bank_chips_pos),
                "comfortRating": "Optimal Resting Arm / Gaze-Pinch Zone (< 0.85m)",
            },
            "holeCardsPeekZone": {
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
                "comfortRating": "Ergonomic Rim Rest for Eye + Pinch Confirmation",
            },
        },
        "assetsExported": [
            "/models/vip_poker_table.usdz",
            "/models/vip_poker_table.glb",
        ],
    }


def main():
    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public", "models"))
    os.makedirs(out_dir, exist_ok=True)

    clear_scene()
    build_vip_poker_table()

    usdz_path = os.path.join(out_dir, "vip_poker_table.usdz")
    glb_path = os.path.join(out_dir, "vip_poker_table.glb")
    report_path = os.path.join(out_dir, "vision_pro_ergonomics_report.json")

    # Export native Apple Vision Pro USDZ for Safari AR QuickLook (<a rel="ar">)
    bpy.ops.wm.usd_export(
        filepath=usdz_path,
        selected_objects_only=False,
        export_materials=True,
    )

    # Export standard glTF 2.0 Binary (.glb)
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format="GLB",
    )

    report = compute_ergonomics_report()
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print("BLENDER_EXPORT_SUCCESS:", usdz_path, glb_path, report_path)


if __name__ == "__main__":
    main()
