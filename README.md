<img width="128" height="128" src="build/icon.svg"/>

# Fluxtop
A modified, experimental and very hacky fork of [Vesktop](https://github.com/Vencord/Vesktop) which uses an improved version of [Alula](https://github.com/alula)'s [discord-adapter-meme](https://github.com/alula/discord-adapter-meme) to allow connecting to Fluxer from a "desktop" Discord client. Logo made by [jb](https://jbc.lol/).

<img width="1920" height="1032" alt="image" src="https://github.com/user-attachments/assets/2bef5121-4590-4dc4-b582-528a2701d0fc" />


The latest installer is available in [Releases](https://github.com/Patrosi73/Fluxtop/releases/).
## Building
Check out the original [Vesktop readme](VESKTOP-README.md) for build instructions. However, you must also...
- Clone the repository with the `--recurse-submodules` flag to also clone the modified version of `discord-adapter-meme`, and...
- Run `pnpm i` within the `discord-adapter-meme` directory.

## Getting your token
1. Log in to Fluxer on a web browser
2. Open Developer Tools (usually Ctrl+Shift+I), navigate to the Network tab
3. While the network tab is open, click on any open DM. Then look for a request titled `messages?limit=50`, and click on it

  <img width="602" height="294" alt="msedge_O8KR2O6sKY" src="https://github.com/user-attachments/assets/5ff12831-4721-4b9b-bd7e-048301ab36b2" />
  
4. In the Headers tab, scroll down until you see Request Headers. Under that, there should be an Authorization field. Copy the value of it and paste it into Fluxtop's initial setup screen (or the token update screen).
  <img width="539" height="229" alt="msedge_qGBAEiKT74" src="https://github.com/user-attachments/assets/60b55d4b-c964-4b40-ad6c-b1a989761ffd" />
  <img width="586" height="543" alt="fluxtop_XmdLUKGStv" src="https://github.com/user-attachments/assets/8118f741-2ba7-4b93-b13b-06905d8b1154" />


5. If your token is correct you should be logged in. If not (or if it expires in the future), you'll see the Token Update screen. From there, paste in the correct token and try again.

  <img width="586" height="353" alt="image" src="https://github.com/user-attachments/assets/c30be99a-3b61-4ceb-9dbd-726ede75612f" />


## Changes from upstream discord-adapter-meme
- **CDN routing for fluxerusercontent.com URLs**, this allows for badges and some other stuff to work properly
- Fixed domain URLs in profile connections
- Fixed Bluesky connection appearance
- Implemented Devices tab in User Settings
- Make the Connections tab in User Settings fetch connections properly
- Server invite modals having proper flags, join states, and banner URLs
- **Local Protobuf saving** (this allows you to save settings normally unavailable on Fluxer, like themes etc)
- Fixup Gateway websocket responses to be more in line with what Discord expects
- Fixed up DM opening to not create a GC

## Changes from upstream Vesktop
- Implemented token login, this is required for Fluxer as replicating normal authentication is impossible
  - Also added detection if the token expires
- Fixed up titlebar defaults on Windows, this makes the Discord titlebar actually work by default (this was personally bothering me :P)

## TODO
- Prevent spam on `/api/v9/users` when in a DM
- Intermittent not loading of channels (most of the time it's the channel that is loaded first upon clicking on a server)
- Make toggling connection visibility work
- Implement Server Discovery (it should be working?? I honestly don't know why the client refuses to fetch it)
- Implement different badges for Plutonium/Visionary, also add support for "subscribed since {certain date}"
- Add additional Protobuf translations like turning off incoming DMs or friend requests
- Loading more profile data when clicking on a channel
- Image uploads
- make the app actually start on macOS (codesigning stuff...)
- VC support (totally going to happen...)
