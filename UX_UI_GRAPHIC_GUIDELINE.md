# 3D Spatial Hold'em: UX/UI and 3D graphics guideline

> Design goal: the player should feel they are sitting across from real people in a small private VIP salon.
> The characters get sculpted heads and hands, skin and cornea shading, breathing and eye movement. The 2D HUD uses obsidian with one champagne gold accent and never covers a character's face or torso.

## 1. Character realism

1. Sculpted heads, torsos and hands (`populate3DCharacterHeadAndTorso`, `buildArticulatedForearmAndHand`)
   - Placeholder primitives, such as capsule torsos or sphere hands, are not allowed.
   - All five characters (Dealer, Viktor, Elena, Bao, Marcus) have sculpted heads with cheekbones, brow ridge, nose bridge and alae, philtrum and lips, and jawline and chin. Each also has shoulders, forearms, wrists, palms, and five fingers with multiple joints, thumb through little finger.
2. Skin and eye materials
   - Skin (`THREE.MeshPhysicalMaterial`): warm sheen to imitate subsurface scattering (`sheen: 0.38`, `sheenRoughness: 0.65`, `sheenColor: '#f59e7a'`), bump-mapped pores (`bumpScale`), and faint specular highlights on the forehead and nose bridge (`clearcoat: 0.08`).
   - Eyes (`THREE.MeshPhysicalMaterial`): separate sclera, iris and pupil layers under a cornea clearcoat (`clearcoat: 1.0`, `clearcoatRoughness: 0.04`) so the eyes catch the light.
3. Idle behavior and tells
   - Blinking: each character blinks on its own interval (2.8s to 4.6s), and eyelid aperture changes with state (`thinking`, `confident`, `folded`, `bluff_tell`).
   - Gaze: small saccades of the pupil and iris, and head rotation that follows the active player, the pot, or the Seat #0 hero.
   - Breathing and hands: chest motion from breathing, an idle hand pose per persona, and gestures for betting and folding.

## 2. Salon lighting and PBR materials

1. Three-point lighting on the characters
   - Key: warm overhead chandelier spotlight (`#fffaed`, 2700K to 3000K)
   - Fill: light bounced off the felt plus soft fill lights (`#d4af37` / `#f5d08a`)
   - Rim: champagne gold and cool slate rim lights that separate the silhouettes from the background
2. Textures and color space (`SRGBColorSpace`)
   - Textures live under `public/assets/pbr/`: felt (`fabric_nor_1k.jpg`, `fabric_rough_1k.jpg`), leather armrest (`leather_nor_1k.jpg`, `leather_rough_1k.jpg`), mahogany (`wood_diff/nor/rough_1k.jpg`), marble floor (`floor_diff/nor/rough_1k.jpg`), and the HDRI environment map (`salon_env_1k.hdr`). Bind them with `SRGBColorSpace` where it applies.

## 3. Nothing covers a face or torso

1. No 2D opponent banners across the middle of the screen
   - Horizontal opponent status banners in the middle band (`y: 68px ~ 160px`) would cover the faces and upper bodies of the dealer and AI players, so they are not allowed.
2. Plaques low on the front rail (`plaqueMesh`)
   - Each character's nameplate (`plaqueMesh`) sits low on the front table rail, in front of their hands (`y = 0.19m, z = 0.28m`). Head height is about `y ≈ 0.54m`, so the plaque never reaches the face.
3. 2D HUD at the screen edges (0% character coverage from `seat0_pov`)
   - Top left (`Top-Left`): one status line with street, hand number, blind level and `TOTAL POT` (`y <= 64px`).
   - Top right (`Top-Right`): one menu and settings button (`Menu / Settings`).
   - Bottom center (`Bottom Dock`): hole-card Peek controls, a compact GTO strip, and the betting buttons (`Fold`, `Check/Call`, `Bet/Raise`).

## 4. At most 6 buttons on screen

1. Button limit on the main HUD
   - In the default view, with drawers closed, the main HUD shows at most 6 visible `<button>` elements:
     1. `Menu / Settings` (opens the drawer, top right)
     2. `Peek` (hold to see hole cards)
     3. `Lock Peek` (keeps hole cards revealed)
     4. `Fold` (hidden at showdown)
     5. `Check / Call` (hidden at showdown)
     6. `Raise / Bet` (replaced by `Deal Next Hand` at showdown)
2. Everything else goes in the drawer
   - The top-right `Menu / Settings` drawer holds the camera presets and scenario loader (`3D Inspector`), the `GTO Solver` 13×13 range matrix, `Table Talk` emotes, manual chip toss (`$1–$100`), the audio, music and voice toggles, `Vision Pro (.USDZ)`, and `WebXR` entry.
3. Only one HUD at a time (`hud_2d_3d_mutual_exclusivity`)
   - The 2D DOM HUD (`[data-ux-layer="main-hud"]`) and the 3D rim buttons on the Seat #0 leather armrest (`fold`, `call`, `raise`, `peek_or_next`) are never shown together:
     - Desktop 2D mode (`show2DHUD === true && !isInXR`): the 2D edge panels render. All 4 rim button meshes are hidden (`mesh.visible = false`) and excluded from pointer and controller raycasting.
     - Pure 3D mode (`show2DHUD === false`) or WebXR (`isInXR === true`): every 2D panel (`top-left-status`, `bottom-action-dock`, etc.) is unmounted, leaving `0` visible panels. The 4 rim buttons on the armrest are visible (`mesh.visible = true`) and respond to raycasts.

## 5. Color: obsidian plus one gold accent

1. Three tones only
   - Surface: matte obsidian (`#090c12` / `rgba(9, 12, 18, 0.88)`)
   - Text: warm ivory (`#f8fafc`) and muted slate (`#94a3b8`)
   - Accent: brushed champagne gold (`#d4af37` / `#f3e5ab`)
2. No neon or multicolor badges on the main HUD or the 3D plaques
   - Saturated or neon colors are not allowed there: cyan (`cyan`), purple (`purple`), saturated blue (`blue`), orange (`orange`), neon emerald (`emerald`), and neon rose (`rose`).

## 6. Automated checks (`npm run verify:ux`)

| Tier | Check ID | Pass criteria |
| :--- | :--- | :--- |
| Tier 1: 3D realism and performance | `pbr_textures_and_color_space` | All 9 PBR textures loaded and `SRGBColorSpace` verified |
| | `character_human_presence_rig` | All 5 characters have `MeshPhysicalMaterial` skin and cornea shading, blink and gaze rigs, and 5-finger articulated hands |
| | `webgl_draw_call_budget` | `Draw Calls <= 450` across all camera presets and scenarios |
| | `spatial_layout_clearance` | `0` clipping or overlap violations between 3D cards, chip stacks and plaques |
| | `hud_2d_3d_mutual_exclusivity` | `0` visible 3D rim buttons when `show2DHUD === true`; `4` visible rim buttons and `0` 2D HUD panels when `show2DHUD === false` or `isInXR === true` |
| Tier 2: sightlines and minimalism | `zero_character_sightline_occlusion` | `0%` overlap between the projected 2D bounding boxes of character heads and torsos (`seat0_pov`) and visible 2D HUD panels |
| | `primary_action_button_cap` | Visible `<button>` count on the main HUD `<= 6` |
| | `monochrome_gold_color_restraint` | `0` banned saturated or neon colors in the computed styles (`color`, `backgroundColor`, `borderColor`) of visible main HUD elements |
| Tier 3: visual proof and report | `multi_scenario_visual_proof` | Captures in 2D HUD mode, pure 3D HUD mode, showdown, and character close-up, with a JSON report (`allPassed: true`) |
