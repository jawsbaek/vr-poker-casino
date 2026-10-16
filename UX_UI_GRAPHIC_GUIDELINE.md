# 3D Spatial Hold'em — UX/UI & 3D Graphic Guideline

> **Design North Star**: *"Facing Real Individuals in an Intimate Private VIP Salon"*  
> Deliver the tactile presence of sitting across from real individuals through anatomical 3D character sculpting, subsurface skin & cornea clearcoat PBR shading, natural breathing, and ocular gaze tracking—while unifying the 2D HUD into an unobtrusive monochrome obsidian + single champagne gold accent system that never occludes character sightlines.

---

## 1. Human-Presence & Character Realism Standard

1. **Anatomical 3D Head, Torso, and Articulated Hand Sculpting (`populate3DCharacterHeadAndTorso`, `buildArticulatedForearmAndHand`)**
   - Primitive placeholder shapes (bowling-pin capsules for torsos or spherical hands) are strictly prohibited.
   - All five characters (Dealer, Viktor, Elena, Bao, Marcus) must feature sculpted 3D heads with distinct **Cheekbones, Brow Ridge, Nose Bridge & Alae, Philtrum & Lips, and Jawline & Chin**, paired with **Shoulders, Forearms, Wrists, Palms, and 5 Articulated Multi-Joint Fingers (Thumb through Little Finger)**.
2. **Subsurface Skin Sheen & Cornea Clearcoat PBR Materials**
   - **Skin (`THREE.MeshPhysicalMaterial`)**: Warm subsurface scattering sheen (`sheen: 0.38`, `sheenRoughness: 0.65`, `sheenColor: '#f59e7a'`), micro-pore bump mapping (`bumpScale`), and subtle forehead/nasal-bridge specular highlights (`clearcoat: 0.08`).
   - **Eyes (`THREE.MeshPhysicalMaterial`)**: Multi-layered Sclera + Iris + Pupil anatomy with cornea clearcoat reflections (`clearcoat: 1.0`, `clearcoatRoughness: 0.04`) to produce lifelike eye catchlights.
3. **Micro-Behaviors & Live Behavioral Tells**
   - **Periodic Blinking**: Independent per-character blink intervals (2.8s–4.6s) and emotional eyelid aperture states (`thinking`, `confident`, `folded`, `bluff_tell`).
   - **Eye Saccades & Gaze Tracking**: Subtle pupil/iris saccades and head rotation tracking the active turn player, center pot, or Seat #0 hero.
   - **Breathing & Hand Choreography**: Natural thoracic breathing motion, persona-specific idle hand postures, and dynamic betting/folding gestures.

---

## 2. VIP Salon Lighting & PBR Material Pipeline

1. **3-Point Character Lighting**
   - **Key Light**: Warm overhead chandelier spotlight (`#fffaed`, 2700K–3000K)
   - **Fill Light**: Felt bounce illumination and soft fill lights (`#d4af37` / `#f5d08a`)
   - **Rim / Back Light**: Champagne gold and cool slate rim lighting that separates character silhouettes from the background
2. **Calibrated PBR Textures & Color Space (`SRGBColorSpace`)**
   - All textures under `public/assets/pbr/`—felt fabric (`fabric_nor_1k.jpg`, `fabric_rough_1k.jpg`), leather armrest rail (`leather_nor_1k.jpg`, `leather_rough_1k.jpg`), mahogany wood (`wood_diff/nor/rough_1k.jpg`), marble floor (`floor_diff/nor/rough_1k.jpg`), and HDRI environment map (`salon_env_1k.hdr`)—must be bound with proper `SRGBColorSpace` where applicable.

---

## 3. Zero Face/Torso Sightline Occlusion Rule

1. **Permanent Removal of Mid-Screen 2D Opponent Card Banners**
   - Horizontal 2D opponent status banners across the mid-viewport (`y: 68px ~ 160px`) that block the Dealer's or AI opponents' faces and upper torsos are permanently prohibited.
2. **Low Front-Rail Spatial Plaques (`plaqueMesh`)**
   - Each 3D character's spatial nameplate (`plaqueMesh`) must be mounted low on the **front table rail in front of their hands (`y = 0.19m, z = 0.28m`)**, well below head level (`y ≈ 0.54m`), ensuring zero facial occlusion.
3. **Outer-Edge 2D HUD Docking (0% Character Occlusion from `seat0_pov`)**
   - **Top-Left (`Top-Left`)**: Single-line street phase, hand number, blind level, and `TOTAL POT` status bar (`y <= 64px`).
   - **Top-Right (`Top-Right`)**: Single unified menu/settings trigger button (`Menu / Settings`).
   - **Bottom Center (`Bottom Dock`)**: Hero hole-card Peek controls, compact GTO telemetry strip, and primary betting action buttons (`Fold`, `Check/Call`, `Bet/Raise`).

---

## 4. Action Element Minimalism (Primary Cap ≤ 6)

1. **Maximum 6 Visible Interactive Buttons on the Main HUD**
   - In the default gameplay view (with drawers closed), the total number of visible `<button>` elements on the main HUD is strictly capped at **6 or fewer**:
     1. `Menu / Settings` (Top-right unified drawer trigger)
     2. `Peek` (Hold to peek hole cards)
     3. `Lock Peek` (Toggle persistent hole-card reveal)
     4. `Fold` (Hidden during showdown)
     5. `Check / Call` (Hidden during showdown)
     6. `Raise / Bet` (Replaced by `Deal Next Hand` during showdown)
2. **Consolidation of Secondary Tools into the Unified Drawer**
   - Camera angle presets & scenario loader (`3D Inspector`), `GTO Solver` 13×13 range matrix, `Table Talk` quick emotes, manual chip toss (`$1–$100`), audio/music/voice toggles, `Vision Pro (.USDZ)`, and `WebXR` entry are all consolidated inside the top-right **`Menu / Settings` unified drawer**.
3. **Strict Mutual Exclusivity Between 2D HUD and 3D Spatial Rim HUD (`hud_2d_3d_mutual_exclusivity`)**
   - The 2D DOM HUD (`[data-ux-layer="main-hud"]`) and the 3D Spatial Rim HUD buttons (`fold`, `call`, `raise`, `peek_or_next` on the Seat #0 leather armrest) must **never be displayed simultaneously**:
     - **Desktop 2D HUD Mode (`show2DHUD === true && !isInXR`)**: 2D outer-edge HUD panels are rendered; all 4 3D Spatial Rim HUD meshes are strictly hidden (`mesh.visible = false`) and excluded from pointer/controller raycasting.
     - **Pure 3D Spatial Mode (`show2DHUD === false`) or WebXR Mode (`isInXR === true`)**: All 2D HUD panels (`top-left-status`, `bottom-action-dock`, etc.) are unmounted (`0` visible panels), and the 4 3D Spatial Rim HUD buttons on the leather armrest are visible (`mesh.visible = true`) and raycast-interactive.

---

## 5. Minimal Color Restraint (Monochrome Obsidian + Single Champagne Gold Accent)

1. **Strict 3-Tone Luxury Palette**
   - **Surface**: Deep Obsidian Matte (`#090c12` / `rgba(9, 12, 18, 0.88)`)
   - **Typography**: Warm Ivory (`#f8fafc`) & Muted Slate (`#94a3b8`)
   - **Single Accent**: Brushed Champagne Gold (`#d4af37` / `#f3e5ab`)
2. **Zero Neon or Multi-Color Badges on Main HUD & Spatial UI**
   - Saturated rainbow or neon badge colors—cyan (`cyan`), purple (`purple`), saturated blue (`blue`), orange (`orange`), neon emerald (`emerald`), and neon rose (`rose`)—are prohibited across the main HUD and 3D spatial plaques/badges.

---

## 6. 3-Tier Automated Verification Harness (`npm run verify:ux`)

| Verification Tier | Check ID | Pass Criteria |
| :--- | :--- | :--- |
| **Tier 1: 3D Realism & Performance** | `pbr_textures_and_color_space` | All 9 PBR textures loaded and `SRGBColorSpace` verified |
| | `character_human_presence_rig` | All 5 characters equipped with `MeshPhysicalMaterial` skin/cornea shading, blink/gaze rigs, and 5-finger articulated hands |
| | `webgl_draw_call_budget` | `Draw Calls <= 450` across all camera presets and scenarios |
| | `spatial_layout_clearance` | `0` clipping/overlap violations between 3D cards, chip stacks, and plaques |
| | `hud_2d_3d_mutual_exclusivity` | `0` visible 3D Spatial Rim buttons when `show2DHUD === true`; `4` visible 3D Spatial Rim buttons & `0` 2D HUD panels when `show2DHUD === false` or `isInXR === true` |
| **Tier 2: Sightline & Minimalism** | `zero_character_sightline_occlusion` | `0%` overlap between projected 2D bounding boxes of 3D character heads/torsos (`seat0_pov`) and visible 2D HUD panels |
| | `primary_action_button_cap` | Visible `<button>` count on main HUD `<= 6` |
| | `monochrome_gold_color_restraint` | `0` banned saturated/neon colors in computed styles (`color`, `backgroundColor`, `borderColor`) of visible main HUD elements |
| **Tier 3: Visual Proof & Report** | `multi_scenario_visual_proof` | Automated captures across 2D HUD mode, Pure 3D Spatial HUD mode, Showdown, and Character Close-Up with JSON report (`allPassed: true`) |
