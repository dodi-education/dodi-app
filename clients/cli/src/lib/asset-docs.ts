/**
 * `dodi docs assets`: the companion character format (version 1), condensed
 * from characters/README.md for agents. The validator `dodi assets check`
 * runs is the TS port of characters/validate.py in @dodi/character, so this
 * text and the checks describe the same rules.
 */

export const ASSET_DOC = `# Custom companion avatars and accessories

A family's companion (the 3D character kids talk to) can wear a custom avatar
or custom accessories. Both are glTF 2.0 binaries (.glb), sealed on your
machine and stored in the family's encrypted library. Needs the "assets" scope.

## Workflow
1. \`dodi assets new <folder> --kind avatar|accessory\` scaffolds asset.md.
2. Produce asset.glb in the folder with any glTF tool: a Blender Python script
   (blender --background --python build.py), three.js GLTFExporter in Node,
   or an existing model you are allowed to use. Keep it flat-coloured.
3. \`dodi assets check <folder>\`: validates the .glb against the rules below
   and prints triangles, size, bones, sockets and clips.
4. \`dodi assets push <folder>\`: seals and uploads it. The family then picks
   it in the companion's Look (Playground) in the app.
5. Optional: \`dodi assets publish <folder>\` shares it on dodi Discover for
   every family (needs "assets:publish"; a person reviews it first, and the
   parent must have picked a publication handle). Put a preview.png (about
   512 px, under 1 MB) in the folder for the Discover card. \`dodi assets
   status <folder>\` shows the review state.

## Shared rules
- glTF axes: Y up, the character faces +Z, feet on y = 0, about 1 unit tall.
- Flat colours, no baked lighting: the app adds toon shading and outlines.
- Material extras: "shade_color": "#rrggbb" (the toon shadow tone; make it a
  tinted darker tone, not grey), or "unlit": true to draw a texture as is.

## Avatar (kind: avatar)
- At most 20k triangles, 3 MB, textures up to 1024 px.
- Skeleton: required bones root, body, neck, head. Optional bones the app
  uses when present: jaw, tail, wing_L/R, leg_L/R, foot_L/R, antenna_L/R.
  Every bone has an identity rest rotation (local X = left/right, Y = up,
  Z = forward), so the app can rotate bones in the character's frame.
- Clips: "idle" (looping) is required; listen, think, talk, sleep, happy, sad
  and deaf are used when present. Each clip keys every bone it moves.
- Face (optional but recommended): a mesh named "face" under the head bone,
  with morph targets "<part>_<state>": eyes_open/closed/up/happy/sad and
  mouth_smile/neutral/frown. Default morph weights are 0.
- Jaw (optional): a "jaw" bone; voice loudness opens it around its X axis.
- Sockets: empty nodes under bones where accessories attach:
  socket_head_top (hats), socket_eyes (glasses), socket_ears (headphones),
  socket_neck (scarves), socket_back (backpacks). Add all five if you can.
- Manifest: scene extras.character is a JSON string, e.g.
  {"format":"character","version":1,"name":"fox","height":1.0,
   "clips":["idle","talk"],"sockets":["socket_head_top","socket_eyes","socket_ears","socket_neck","socket_back"]}

## Accessory (kind: accessory)
- At most 8k triangles, 1 MB, textures up to 512 px. A static prop: no skin,
  no clips. It follows the bone its socket hangs on.
- Scene extras.accessory is a JSON string:
  {"format":"accessory","version":1,"name":"crown","socket":"socket_head_top","fitted_to":"dodi"}
- An empty node named "attach" at the accessory's origin, no rotation. The app
  parents the accessory under the socket, so "attach" lands on the socket.
- Fit it to the stock dodi (fitted_to: "dodi"). Its sockets at rest, in
  metres (x, y, z; dodi faces +Z):
    socket_head_top  (0, 0.89, 0.13)   on the head bone
    socket_eyes      (0, 0.765, 0.30)  on the head bone
    socket_ears      (0, 0.715, 0.14)  on the head bone
    socket_neck      (0, 0.55, 0.14)   on the neck bone
    socket_back      (0, 0.50, -0.14)  on the body bone
  Model the accessory around its own origin as if that origin were the socket.
  Keep it out of the face and clear of the antennae.

## Kid-safe
Friendly, non-scary shapes, no weapons, no text or logos you don't own.
`;
