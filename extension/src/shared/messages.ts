import type * as proto from "@proto/ytmusic";

export type PopupToBackgroundChangePort = {
  readonly type: "CHANGE_PORT";
  readonly port: number;
};

export type XivToYtMusicProto = {
  readonly type: "XIV_TO_YTMUSIC";
  readonly msg: proto.ControllerToYtMusic;
};

export type YtMusicToXivProto = {
  readonly type: "YTMUSIC_TO_XIV";
  readonly msg: proto.YtMusicToController;
};

export type PopupToBackgroundMessage = PopupToBackgroundChangePort;
export type BackgroundToContentMessage = XivToYtMusicProto;
export type ContentToBackgroundMessage = YtMusicToXivProto;
