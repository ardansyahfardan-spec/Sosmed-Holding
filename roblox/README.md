# GHOUSTORY Character Creator — Roblox Bridge

This server script connects a player's Roblox account to their saved Ghoustory Control Room character.

## Install in Roblox Studio

1. Open the **Desa Terlarang** place in Roblox Studio.
2. In **Game Settings → Security**, enable **Allow HTTP Requests**.
3. In Explorer, open **ServerScriptService**.
4. Insert a new **Script** named `GhoustoryCharacterBridge`.
5. Copy the contents of [CharacterCreatorServer.server.lua](./CharacterCreatorServer.server.lua) into that Script.
6. Publish the place, then use **Test → Start** or join the published experience.

## Link your account

1. Sign in to Ghoustory Control Room.
2. Open **Ghouse → Character Creator**.
3. Click **Buat kode penghubung**.
4. Join Desa Terlarang using the Roblox account you want to connect.
5. Type this in the in-game chat: `!ghlink YOUR10CHARACTERCODE`.
6. The server consumes the one-time code and loads the saved character.

Codes expire after 10 minutes and can only be used once. Generate a new code if one expires.

## Current bridge scope

- Reads the saved profile by Roblox UserId from the Supabase Edge Function.
- Applies skin tone to the character's body.
- Builds simple server-side hair styles and the selected glasses, cap, or headset.
- Applies saved shirt and pants color values to body-part colors where those body parts are visible.
- Stores the character display name and update timestamp as character attributes.

This is the first integration pass. It does not yet replace Roblox clothing assets, facial decals, or the player's full avatar rig with a custom R15 rig. Those require a separate asset/rig pass.
