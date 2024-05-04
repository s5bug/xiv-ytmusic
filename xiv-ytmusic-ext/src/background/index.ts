import { chromeExtension } from '@crxjs/vite-plugin'

chrome.runtime.onStartup.addListener(() => {
  console.log("startup! this message exists to work around a Chrome bug")
})

interface RpcTx {
  tx_id: string
}

interface RpcGetVolume extends RpcTx {
  msg_type: "get_volume"
}

interface RpcGetVolumeAck extends RpcTx {
  msg_type: "get_volume_ack",
  volume: number
}

interface RpcSetVolume extends RpcTx {
  msg_type: "set_volume"
  volume: number
}

interface RpcSetVolumeAck extends RpcTx {
  msg_type: "set_volume_ack"
  volume: number
}

interface RpcNowPlaying extends RpcTx {
  msg_type: "now_playing"
}

interface NowPlayingData {
  title: string,
  author: string,
  thumbnail_url: string,
  cover_url: string
}
interface RpcNowPlayingAck extends RpcTx, NowPlayingData {
  msg_type: "now_playing_ack"
}

interface RpcPlay extends RpcTx {
  msg_type: "play"
}
interface RpcPlayAck extends RpcTx {
  msg_type: "play_ack"
}
interface RpcPause extends RpcTx {
  msg_type: "pause"
}
interface RpcPauseAck extends RpcTx {
  msg_type: "pause_ack"
}
interface RpcNext extends RpcTx {
  msg_type: "next"
}
interface RpcNextAck extends RpcTx {
  msg_type: "next_ack"
}
interface RpcPrevious extends RpcTx {
  msg_type: "previous"
}
interface RpcPreviousAck extends RpcTx {
  msg_type: "previous_ack"
}

type RpcMsg =
  RpcGetVolume | RpcGetVolumeAck |
  RpcSetVolume | RpcSetVolumeAck |
  RpcNowPlaying | RpcNowPlayingAck |
  RpcPlay | RpcPlayAck |
  RpcPause | RpcPauseAck |
  RpcNext | RpcNextAck |
  RpcPrevious | RpcPreviousAck

const waitForElem = async <K extends Element>(selector: string): Promise<K> => {
  return new Promise(resolve => {
    if (document.querySelector(selector)) {
      return resolve(document.querySelector<K>(selector)!);
    }

    const observer = new MutationObserver(mutations => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve(document.querySelector<K>(selector)!);
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  });
}

const getOrCreateYtmTab = async () => {
  let extantYtmTabs = await chrome.tabs.query({
    url: "*://music.youtube.com/*"
  })
  let chosenTab;
  if(extantYtmTabs.length > 0) {
    chosenTab = extantYtmTabs[0]
  } else {
    chosenTab = await chrome.tabs.create({
      url: "https://music.youtube.com/",
      pinned: true,
      active: false
    })
  }

  await chrome.scripting.executeScript({
    target: { tabId: chosenTab.id! },
    func: waitForElem,
    args: [ "#player" ],
    world: "MAIN"
  })

  return chosenTab
}

let rpcHost = chrome.runtime.connectNative("tf.bug.xiv_ytmusic_rpchost")
console.log("rpc host started: ", rpcHost)

const sendMsg = (msg: RpcMsg): void => {
  console.log("sending msg: ", msg)
  rpcHost.postMessage(msg)
}

const tabCtxGetVolume = (): number => {
  // @ts-ignore
  let player: YT.Player = document.querySelector("#player").getPlayer()
  return player.getVolume()
}
const handleGetVolumeMsg = async (msg: RpcGetVolume): Promise<void> => {
  let tab = await getOrCreateYtmTab()
  let [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    func: tabCtxGetVolume,
    args: [],
    world: "MAIN"
  })

  let returnMsg: RpcGetVolumeAck = {
    tx_id: msg.tx_id,
    msg_type: "get_volume_ack",
    volume: result.result!
  }

  sendMsg(returnMsg)
}

const tabCtxSetVolume = (v: number): number => {
  // @ts-ignore
  let player: YT.Player = document.querySelector("#player").getPlayer()
  player.setVolume(v)
  return player.getVolume()
}
const handleSetVolumeMsg = async (msg: RpcSetVolume): Promise<void> => {
  let tab = await getOrCreateYtmTab()
  let [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    func: tabCtxSetVolume,
    args: [ msg.volume ],
    world: "MAIN"
  })

  let returnMsg: RpcSetVolumeAck = {
    tx_id: msg.tx_id,
    msg_type: "set_volume_ack",
    volume: result.result!
  }

  sendMsg(returnMsg)
}

const tabCtxNowPlaying = (): NowPlayingData => {
  let playerElem: HTMLElement = document.querySelector("#player")!
  // @ts-ignore
  let player: YT.Player = playerElem.getPlayer()

  // TODO type getVideoData()
  // @ts-ignore
  let title: string = player.getVideoData().title
  // @ts-ignore
  let author: string = player.getVideoData().author
  let cover: string = playerElem.querySelector<HTMLImageElement>("#song-image #thumbnail img")!.src
  let thumb: string = cover

  return {
    title,
    author,
    cover_url: cover,
    thumbnail_url: thumb
  }
}
const handleNowPlayingMsg = async (msg: RpcNowPlaying): Promise<void> => {
  let tab = await getOrCreateYtmTab()
  let [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    func: tabCtxNowPlaying,
    args: [ ],
    world: "MAIN"
  })

  let returnMsg: RpcNowPlayingAck = {
    tx_id: msg.tx_id,
    msg_type: "now_playing_ack",
    ...result.result!
  }

  sendMsg(returnMsg)
}

const tabCtxPlay = (): void => {
  // @ts-ignore
  let player: YT.Player = document.querySelector("#player").getPlayer()

  return player.playVideo()
}
const handlePlayMsg = async (msg: RpcPlay): Promise<void> => {
  let tab = await getOrCreateYtmTab()
  let [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    func: tabCtxPlay,
    args: [ ],
    world: "MAIN"
  })

  let returnMsg: RpcPlayAck = {
    tx_id: msg.tx_id,
    msg_type: "play_ack"
  }

  sendMsg(returnMsg)
}

const tabCtxPause = (): void => {
  // @ts-ignore
  let player: YT.Player = document.querySelector("#player").getPlayer()

  player.pauseVideo()
}
const handlePauseMsg = async (msg: RpcPause): Promise<void> => {
  let tab = await getOrCreateYtmTab()
  let [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    func: tabCtxPause,
    args: [ ],
    world: "MAIN"
  })

  let returnMsg: RpcPauseAck = {
    tx_id: msg.tx_id,
    msg_type: "pause_ack"
  }

  sendMsg(returnMsg)
}

const tabCtxNext = (): void => {
  // @ts-ignore
  let player: YT.Player = document.querySelector("#player").getPlayer()

  player.nextVideo()
}
const handleNextMsg = async (msg: RpcNext): Promise<void> => {
  let tab = await getOrCreateYtmTab()
  let [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    func: tabCtxNext,
    args: [ ],
    world: "MAIN"
  })

  let returnMsg: RpcNextAck = {
    tx_id: msg.tx_id,
    msg_type: "next_ack"
  }

  sendMsg(returnMsg)
}

const tabCtxPrevious = (): void => {
  // @ts-ignore
  let player: YT.Player = document.querySelector("#player").getPlayer()

  player.previousVideo()
}
const handlePreviousMsg = async (msg: RpcPrevious): Promise<void> => {
  let tab = await getOrCreateYtmTab()
  let [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    func: tabCtxPrevious,
    args: [ ],
    world: "MAIN"
  })

  let returnMsg: RpcPreviousAck = {
    tx_id: msg.tx_id,
    msg_type: "previous_ack"
  }

  sendMsg(returnMsg)
}

const handleMsg = async (msg: RpcMsg): Promise<void> => {
  switch(msg.msg_type) {
    case 'get_volume':
      await handleGetVolumeMsg(msg)
      break
    case 'set_volume':
      await handleSetVolumeMsg(msg)
      break
    case 'now_playing':
      await handleNowPlayingMsg(msg)
      break
    case 'play':
      await handlePlayMsg(msg)
      break
    case 'pause':
      await handlePauseMsg(msg)
      break
    case 'next':
      await handleNextMsg(msg)
      break
    case 'previous':
      await handlePreviousMsg(msg)
      break
  }
}

rpcHost.onMessage.addListener((msg: RpcMsg) => {
  console.log("received msg: ", msg)
  handleMsg(msg) // fire-and-forget
})
