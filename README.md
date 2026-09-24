<img width="128" height="128" src="build/icon.svg"/>

# Fluxtop
A modified, experimental and very hacky fork of [Vesktop](https://github.com/Vencord/Vesktop) which uses an improved version of [Alula](https://github.com/alula)'s [discord-adapter-meme](https://github.com/alula/discord-adapter-meme) to allow connecting to Fluxer from a "desktop" Discord client. Logo made by [jb](https://jbc.lol/).

<img width="1920" height="1032" alt="image" src="https://github.com/user-attachments/assets/2bef5121-4590-4dc4-b582-528a2701d0fc" />


The latest installer is available in [Releases](https://github.com/Patrosi73/Fluxtop/releases/).
## Building
Check out the original [Vesktop readme](VESKTOP-README.md) for build instructions. However, you must also...
- Clone the repository with the `--recurse-submodules` flag to also clone the modified version of `discord-adapter-meme`, and...
- Run `pnpm i` within the `discord-adapter-meme` directory.

## Logging in
The client supports logging in using Fluxer Canary, Stable as well as **custom Fluxer instances**. You can select which instance to use in the picker in the initial setup screen or the session update screen.

The recommended way to log in is to use desktop handoff, the same mechanism that the official Fluxer desktop app uses. Get a code and enter it on the Fluxer website where you're already logged in to authenticate with the client.

<img width="1251" height="651" alt="image" src="https://github.com/user-attachments/assets/3eafb4a7-c261-4ea6-a9b0-03ba2d773d31" />

If you selected one of the official instances, you can also freely switch between them later on within Fluxtop Settings in the client.

<img width="767" height="207" alt="image" src="https://github.com/user-attachments/assets/206524b4-cd94-466f-a38f-e38f3bcef2f2" />

If you'd like to switch to a custom instance and vice versa, log out. You'll be greeted with the session update screen where you can enter your custom instance's URL.

<img width="607" height="401" alt="image" src="https://github.com/user-attachments/assets/cf63d3ce-e5c6-4db7-8aa9-1aa5fc23aa9e" />

Desktop handoff is recommended but as an alternative, you may log in with an existing Fluxer session token. The below section outlines how to get your token.

# Getting your token
1. Log in to Fluxer on a web browser
2. Open Developer Tools (usually Ctrl+Shift+I), navigate to the Network tab
3. While the network tab is open, click on any open DM. Then look for a request titled `messages?limit=50`, and click on it

  <img width="602" height="294" alt="msedge_O8KR2O6sKY" src="https://github.com/user-attachments/assets/5ff12831-4721-4b9b-bd7e-048301ab36b2" />
  
4. In the Headers tab, scroll down until you see Request Headers. Under that, there should be an Authorization field. Copy the value of it and paste it into Fluxtop's initial setup screen (or the session update screen).
   
  <img width="539" height="229" alt="msedge_qGBAEiKT74" src="https://github.com/user-attachments/assets/60b55d4b-c964-4b40-ad6c-b1a989761ffd" />


6. If your token is correct you should be logged in. If not (or if it expires in the future), you'll see the session update screen. From there, paste in the correct token and try again.

  <img width="586" height="353" alt="image" src="https://github.com/user-attachments/assets/c30be99a-3b61-4ceb-9dbd-726ede75612f" />


## Changes from upstream discord-adapter-meme
- **CDN routing for fluxerusercontent.com URLs** (this allows for badges and some other stuff to work properly)
- Fixed domain URLs in profile connections
- Fixed Bluesky connection appearance
- Implemented Devices tab in User Settings
- Make the Connections tab in User Settings fetch connections properly
- Server invite modals having proper flags, join states, and banner URLs
- **Local Protobuf saving** (this allows you to save settings normally unavailable on Fluxer, like themes etc)
- Fixed up Gateway websocket responses to be more in line with what Discord expects
- Fixed up DM opening to not create a GC
- Fixed up relationships API transforming to use the right HTTP request methods in the right cases

## Changes from upstream Vesktop
- Implemented token login, this is required for Fluxer as proxying regular authentication is impossible
  - Also added detection if the token expires

## TODO
- Make toggling connection visibility work
- Implement Server Discovery (it should be working?? I honestly don't know why the client refuses to fetch it)
- Implement different badges for Plutonium/Visionary, also add support for "subscribed since {certain date}"
- Add additional Protobuf translations like turning off incoming DMs or friend requests
- Loading more profile data when clicking on a channel
  - This seems to be related to the member list not working for certain servers. I'm honestly not sure what's the problem here
- Implement custom status updates and presence updates (online/idle/dnd/invisible)
- Normalize URL behavior when sending a message with a copied URL from the app (bring back the original url when a message is sent, not the localhost one so people outside Fluxtop can click it)
- Image uploads
- fix the updater on macOS (codesigning stuff...)
- VC support (totally going to happen...)
