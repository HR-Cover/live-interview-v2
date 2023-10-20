import React, { useEffect, useState } from "react";
import { Grid, CircularProgress, Box } from "@mui/material";
import { useParams } from "react-router-dom";
import WaitingRoom from "./WaitingRoom";
import _ from "lodash";
import MeetingRoom from "./MeetingRoom";
import MessageDrawer from "Components/MessageDrawer";
import { useSnackbar } from "notistack";
import { SnackbarProvider } from "notistack";
import AntSnackBar from "Components/AntSnackBar";
import LeftTheRoom from "./LeftTheRoom";
import { WebRTCAdaptor} from "@antmedia/webrtc_adaptor";
import { VideoEffect} from "@antmedia/webrtc_adaptor";

import { getUrlParameter } from "@antmedia/webrtc_adaptor";
import { SvgIcon } from "../Components/SvgIcon";
import ParticipantListDrawer from "../Components/ParticipantListDrawer";

import { getRoomNameAttribute, getWebSocketURLAttribute } from "../utils";

export const ConferenceContext = React.createContext(null);

const globals = {
  //this settings is to keep consistent with the sdk until backend for the app is setup
  // maxVideoTrackCount is the tracks i can see excluding my own local video.so the use is actually seeing 3 videos when their own local video is included.
  maxVideoTrackCount: 30,
  trackEvents: [],
};

const JoinModes = {
  MULTITRACK: "multitrack",
  MCU: "mcu"
}

function getPlayToken() {
  const dataPlayToken = document.getElementById("root").getAttribute("data-play-token");
  return (dataPlayToken) ? dataPlayToken : getUrlParameter("playToken");
}

function getPublishToken() {
  const dataPublishToken = document.getElementById("root").getAttribute("data-publish-token");
  return (dataPublishToken) ? dataPublishToken : getUrlParameter("publishToken");
}

var playToken = getPlayToken();
var publishToken = getPublishToken();
var mcuEnabled = getUrlParameter("mcuEnabled");
var InitialStreamId = getUrlParameter("streamId");
var playOnly = getUrlParameter("playOnly");
var subscriberId = getUrlParameter("subscriberId");
var subscriberCode = getUrlParameter("subscriberCode");
var scrollThreshold = -Infinity;
var scroll_down=true;
var last_warning_time=null;

var videoQualityConstraints = {
  video: {
    width: { max: 320 },
    height: { max: 240 },
  }
}

var audioQualityConstraints = {
  audio: {
    noiseSuppression: true,
    echoCancellation: true
  }
}

var mediaConstraints = {
  // setting constraints here breaks source switching on firefox.
  video: videoQualityConstraints.video,
  audio: audioQualityConstraints.audio,
};

let websocketURL = process.env.REACT_APP_WEBSOCKET_URL;

if (!websocketURL) 
{
  
  websocketURL = getWebSocketURLAttribute();
  
  if (!websocketURL) 
  {
    const appName = window.location.pathname.substring(
        0,
        window.location.pathname.lastIndexOf("/") + 1
    );
    const path =
        window.location.hostname +
        ":" +
        window.location.port +
        appName +
        "websocket";
    websocketURL = "ws://" + path;

    if (window.location.protocol.startsWith("https")) {
      websocketURL = "wss://" + path;
    }
  }

}

var fullScreenId = -1;

if (mcuEnabled == null) {
  mcuEnabled = false;
}

if (playOnly == null) {
  playOnly = false;
}

if (playToken == null || typeof playToken === "undefined") {
    playToken = "";
}

if (publishToken == null || typeof publishToken === "undefined") {
    publishToken = "";
}

var roomOfStream = [];

var audioListenerIntervalJob = null;


var room = null;
var reconnecting = false;
var publishReconnected;
var playReconnected;

function AntMedia() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const id = (getRoomNameAttribute()) ? getRoomNameAttribute() : useParams().id;
  const roomName = id;

  // drawerOpen for message components.
  const [messageDrawerOpen, setMessageDrawerOpen] = useState(false);

  // drawerOpen for participant list components.
  const [participantListDrawerOpen, setParticipantListDrawerOpen] = useState(false);

  const [publishStreamId, setPublishStreamId] = useState(InitialStreamId);

  // this is my own name when i enter the room.
  const [streamName, setStreamName] = useState("");

  // this is for checking if i am sharing my screen with other participants.
  const [isScreenShared, setIsScreenShared] = useState(false);

  //we are going to store number of unread messages to display on screen if user has not opened message component.
  const [numberOfUnReadMessages, setNumberOfUnReadMessages] = useState(0);

  // pinned screen this could be by you or by shared screen.
  const [pinnedVideoId, setPinnedVideoId] = useState(null);

  // this one just triggers the re-rendering of the component.
  const [participantUpdated, setParticipantUpdated] = useState(false);

  const [roomJoinMode, setRoomJoinMode] = useState(JoinModes.MULTITRACK);

  const [screenSharedVideoId, setScreenSharedVideoId] = useState(null);
  const [waitingOrMeetingRoom, setWaitingOrMeetingRoom] = useState("waiting");
  const [leftTheRoom, setLeftTheRoom] = useState(false);
  // { id: "", track:{} },
  const [participants, setParticipants] = useState([]);
  const [allParticipants, setAllParticipants] = useState({});
  const [audioTracks, setAudioTracks] = useState([]);
  const [mic, setMic] = useState([]);
  const [talkers, setTalkers] = useState([]);
  const [isPublished, setIsPublished] = useState(false);
  const [selectedCamera, setSelectedCamera] = React.useState("");
  const [selectedMicrophone, setSelectedMicrophone] = React.useState("");
  const [selectedBackgroundMode, setSelectedBackgroundMode] = React.useState("");
  const [isVideoEffectRunning, setIsVideoEffectRunning] = React.useState(false);
  const [virtualBackground, setVirtualBackground] = React.useState(null);
  const timeoutRef = React.useRef(null);
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();

  const [messages, setMessages] = React.useState([]);

  const [devices, setDevices] = React.useState([]);
  const [cam, setCam] = useState([
    {
      eventStreamId: "localVideo",
      isCameraOn: true, //start with camera on
    },
  ]);
  const [isPlayOnly] = React.useState(playOnly);

  const [localVideo, setLocalVideoLocal] = React.useState(null);

  const [webRTCAdaptor, setWebRTCAdaptor] = React.useState();
  const [initialized, setInitialized] = React.useState(false);
  const [recreateAdaptor, setRecreateAdaptor] = React.useState(true);
  const [closeScreenShare, setCloseScreenShare] = React.useState(false);

  function makeFullScreen(divId) {
    if (fullScreenId === divId) {
      document.getElementById(divId).classList.remove("selected");
      document.getElementById(divId).classList.add("unselected");
      fullScreenId = -1;
    } else {
      document.getElementsByClassName("publisher-content")[0].className =
        "publisher-content chat-active fullscreen-layout";
      if (fullScreenId !== -1) {
        document.getElementById(fullScreenId).classList.remove("selected");
        document.getElementById(fullScreenId).classList.add("unselected");
      }
      document.getElementById(divId).classList.remove("unselected");
      document.getElementById(divId).classList.add("selected");
      fullScreenId = divId;
    }
  }


  function checkAndUpdateVideoAudioSources() {
    let isVideoDeviceAvailable = false;
    let isAudioDeviceAvailable = false;
    let selectedDevices = getSelectedDevices();
    let currentCameraDeviceId = selectedDevices.videoDeviceId;
    let currentAudioDeviceId = selectedDevices.audioDeviceId;

    // check if the selected devices are still available
    for (let index = 0; index < devices.length; index++) {
      if (devices[index].kind === "videoinput" && devices[index].deviceId === selectedDevices.videoDeviceId) {
        isVideoDeviceAvailable = true;
      }
      if (devices[index].kind === "audioinput" && devices[index].deviceId === selectedDevices.audioDeviceId) {
        isAudioDeviceAvailable = true;
      }
    }

    // if the selected devices are not available, select the first available device
    if (selectedDevices.videoDeviceId === '' || isVideoDeviceAvailable === false) {
      const camera = devices.find(d => d.kind === 'videoinput');
      if (camera) {
        selectedDevices.videoDeviceId = camera.deviceId;
      }
    }
    if (selectedDevices.audioDeviceId === '' || isAudioDeviceAvailable === false) {
      const audio = devices.find(d => d.kind === 'audioinput');
      if (audio) {
        selectedDevices.audioDeviceId = audio.deviceId;
      }
    }

    setSelectedDevices(selectedDevices);

    if (webRTCAdaptor !== null && currentCameraDeviceId !== selectedDevices.videoDeviceId) {
      webRTCAdaptor.switchVideoCameraCapture(publishStreamId, selectedDevices.videoDeviceId);
    }
    if (webRTCAdaptor !== null && (currentAudioDeviceId !== selectedDevices.audioDeviceId || selectedDevices.audioDeviceId === 'default')) {
      webRTCAdaptor.switchAudioInputSource(publishStreamId, selectedDevices.audioDeviceId);
    }
  }

  function reconnectionInProgress() {
    //reset UI releated states
    setParticipants([]);
    setAllParticipants([]);

    reconnecting = true;
    publishReconnected = false;
    playReconnected = false;

    displayWarning("Connection lost. Trying reconnect...");
  }

  function joinRoom(roomName, generatedStreamId, roomJoinMode) {
    room = roomName;
    roomOfStream[generatedStreamId] = room;

    globals.maxVideoTrackCount = 30; //FIXME
    setPublishStreamId(generatedStreamId);

    if (!playOnly) {
      handlePublish(
        generatedStreamId,
        publishToken,
        subscriberId,
        subscriberCode
      );
    }

    webRTCAdaptor.play(roomName, playToken, roomName, null, subscriberId, subscriberCode);
  }

  async function checkDevices() {
      let devices = await navigator.mediaDevices.enumerateDevices();
      let audioDeviceAvailable = false
      let videoDeviceAvailable = false
      devices.forEach(device => {
          if(device.kind==="audioinput"){
            audioDeviceAvailable = true;
          }
          if(device.kind==="videoinput"){
            videoDeviceAvailable = true;
          }
      });

      if(!audioDeviceAvailable) {
        mediaConstraints.audio = false;
      }
      if(!videoDeviceAvailable) {
        mediaConstraints.video = false;
      }
  }



  useEffect(() => {
    async function createWebRTCAdaptor() {
      //here we check if audio or video device available and wait result
      //according to the result we modify mediaConstraints
      await checkDevices();
      if (recreateAdaptor && webRTCAdaptor == null) {
        setWebRTCAdaptor(new WebRTCAdaptor({
          websocket_url: websocketURL,
          mediaConstraints: mediaConstraints,
          isPlayMode: playOnly,
          debug: true,
          callback: infoCallback,
          callbackError: errorCallback
        }))

        setRecreateAdaptor(false);
      }
    }
    createWebRTCAdaptor();
  }, [recreateAdaptor]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (webRTCAdaptor) {
    webRTCAdaptor.callback = infoCallback;
    webRTCAdaptor.callbackError = errorCallback;
    webRTCAdaptor.localStream = localVideo;
  }

  function infoCallback(info, obj) {
    if (info === "initialized") {
      enableDisableMCU(mcuEnabled);
      setInitialized(true);
    } else if (info === "broadcastObject") {
      if (obj.broadcast === undefined) { return; }

      let broadcastObject = JSON.parse(obj.broadcast);

      if(obj.streamId === roomName) { //maintrack object
        let participantIds = broadcastObject.subTrackStreamIds;

        //find and remove not available tracks
        const temp = allParticipants;
        let currentTracks = Object.keys(temp);
        currentTracks.forEach(trackId => {
          if(!participantIds.includes(trackId)) {
            console.log("stream removed:"+trackId);
            delete temp[trackId];
          }
        });
        setAllParticipants(temp);

        //request broadcast object for new tracks
        participantIds.forEach(pid => {
          if(allParticipants[pid] === undefined) {
            webRTCAdaptor.getBroadcastObject(pid);
          }
        });
      } else { //subtrack object
        if (broadcastObject.metaData !== undefined && broadcastObject.metaData !== null) {
          let userStatusMetadata = JSON.parse(broadcastObject.metaData);

          let micStatusArray = mic;
          let micStatusIndex = micStatusArray.findIndex(x => x.eventStreamId === obj.streamId);
          if (micStatusIndex === -1) {
            micStatusArray.push({eventStreamId: obj.streamId, isMicMuted: userStatusMetadata.isMicMuted});
          } else {
            micStatusArray[micStatusIndex].isMicMuted = userStatusMetadata.isMicMuted;
          }
          setMic(micStatusArray);

          let camStatusArray = cam;
          let camStatusIndex = camStatusArray.findIndex(x => x.eventStreamId === obj.streamId);
          if (camStatusIndex === -1) {
            camStatusArray.push({eventStreamId: obj.streamId, isCameraOn: userStatusMetadata.isCameraOn});
          } else {
            camStatusArray[camStatusIndex].isCameraOn = userStatusMetadata.isCameraOn;
          }
          setCam(camStatusArray);

          if (userStatusMetadata.isScreenShared) {
            // if the participant was already pin someone than we should not update it
            if (!screenSharedVideoId) {
              setScreenSharedVideoId(obj.streamId);
              let videoLab = participants.find((p) => p.id === obj.streamId)
                  ?.videoLabel
                  ? participants.find((p) => p.id === obj.streamId).videoLabel
                  : "";
              pinVideo(obj.streamId, videoLab);
            }
          }
        }

        let allParticipantsTemp = allParticipants;
        allParticipantsTemp[broadcastObject.streamId] = broadcastObject; //TODO: optimize
        setAllParticipants(allParticipantsTemp);
      }

      console.log(obj.broadcast);
    } else if (info === "newStreamAvailable") {
      handlePlayVideo(obj);
    } else if (info === "publish_started") {
      setIsPublished(true);
      console.log("**** publish started:"+reconnecting);
      if(reconnecting) {
        publishReconnected = true;
        reconnecting = !(publishReconnected && playReconnected);
        return;
      }
      console.log("publish started");
      //stream is being published
      webRTCAdaptor.enableStats(publishStreamId);
    } else if (info === "publish_finished") {
      //stream is being finished
    }
    else if (info === "session_restored") {
      console.log("**** session_restored:"+reconnecting);
      if(reconnecting) {
        publishReconnected = true;
        reconnecting = !(publishReconnected && playReconnected);
        return;
      }
    }
    else if (info === "play_started") {
      console.log("**** play started:"+reconnecting);

      webRTCAdaptor.getBroadcastObject(roomName);

      if(reconnecting) {
        playReconnected = true;
        reconnecting = !(publishReconnected && playReconnected);
        return;
      }
    } else if (info === "screen_share_stopped") {
      handleScreenshareNotFromPlatform();
    } else if (info === "screen_share_started") {
      screenShareOnNotification();
    } else if (info === "data_received") {
      try {
        handleNotificationEvent(obj);
      } catch (e) { }
    } else if (info === "available_devices") {
      setDevices(obj);
      checkAndUpdateVideoAudioSources();

    } else if (info === "updated_stats") {
      let rtt = ((parseFloat(obj.videoRoundTripTime) + parseFloat(obj.audioRoundTripTime)) / 2).toPrecision(3);
      let jitter = ((parseFloat(obj.videoJitter) + parseInt(obj.audioJitter)) / 2).toPrecision(3);
      let outgoingBitrate = parseInt(obj.currentOutgoingBitrate);

      let packageLost = parseInt(obj.videoPacketsLost) + parseInt(obj.audioPacketsLost);
      let packageSent = parseInt(obj.totalVideoPacketsSent) + parseInt(obj.totalAudioPacketsSent);
      let packageLostPercentage = 0;
      if (packageLost > 0) {
        packageLostPercentage = ((packageLost / parseInt(packageSent)) * 100).toPrecision(3);
      }

      if (rtt >= 150 || packageLostPercentage >= 2.5 || jitter >= 80 || ((outgoingBitrate / 100) * 80)  >=  obj.availableOutgoingBitrate) {
        console.warn("rtt:"+rtt+" packageLostPercentage:"+packageLostPercentage+" jitter:"+jitter+" Available Bandwidth kbps :",obj.availableOutgoingBitrate,"Outgoing Bandwidth kbps:",outgoingBitrate);
        displayPoorNetworkConnectionWarning();
      }

    } else if (info === "debugInfo") {
      handleDebugInfo(obj.debugInfo);
    }
    else if (info === "ice_connection_state_changed") {
      console.log("iceConnectionState Changed: ", JSON.stringify(obj))
      var iceState = obj.state;
      if (iceState === "failed" || iceState === "disconnected" || iceState === "closed") {

        setTimeout(() => {
          if (webRTCAdaptor.iceConnectionState(publishStreamId) !== "checking" &&
              webRTCAdaptor.iceConnectionState(publishStreamId) !== "connected" &&
              webRTCAdaptor.iceConnectionState(publishStreamId) !== "completed") {
              reconnectionInProgress();
            }
        }, 5000);

      }
    }
  };

  function errorCallback(error, message) {
    //some of the possible errors, NotFoundError, SecurityError,PermissionDeniedError
    var errorMessage = JSON.stringify(error);
    if (typeof message != "undefined") {
      errorMessage = message;
    }
    if (error.indexOf("no_active_streams_in_room") !== -1) {
      // if there is no active stream in the room then we are going to clear the participant list.
      //setParticipants([]);
      //setAllParticipants([]);
    }
    errorMessage = JSON.stringify(error);
    if (error.indexOf("NotFoundError") !== -1) {
      errorMessage =
        "Camera or Mic are not found or not allowed in your device.";
      alert(errorMessage);
    } else if (
      error.indexOf("NotReadableError") !== -1 ||
      error.indexOf("TrackStartError") !== -1
    ) {
      errorMessage =
        "Camera or Mic is being used by some other process that does not not allow these devices to be read.";
      displayWarning(errorMessage);

    } else if (
      error.indexOf("OverconstrainedError") !== -1 ||
      error.indexOf("ConstraintNotSatisfiedError") !== -1
    ) {
      errorMessage =
        "There is no device found that fits your video and audio constraints. You may change video and audio constraints.";
      alert(errorMessage);
    } else if (
      error.indexOf("NotAllowedError") !== -1 ||
      error.indexOf("PermissionDeniedError") !== -1
    ) {
      errorMessage = "You are not allowed to access camera and mic.";
      if(isScreenShared) {
        handleScreenshareNotFromPlatform();
      }
    } else if (error.indexOf("TypeError") !== -1) {
      errorMessage = "Video/Audio is required.";
      displayWarning(errorMessage);
      webRTCAdaptor.mediaManager.getDevices();
    } else if (error.indexOf("UnsecureContext") !== -1) {
      errorMessage =
        "Fatal Error: Browser cannot access camera and mic because of unsecure context. Please install SSL and access via https";
    } else if (error.indexOf("WebSocketNotSupported") !== -1) {
      errorMessage = "Fatal Error: WebSocket not supported in this browser";
    } else if (error.indexOf("no_stream_exist") !== -1) {
      //TODO: removeRemoteVideo(error.streamId);
    } else if (error.indexOf("data_channel_error") !== -1) {
      errorMessage = "There was a error during data channel communication";
    } else if (error.indexOf("ScreenSharePermissionDenied") !== -1) {
      errorMessage = "You are not allowed to access screen share";
      handleScreenshareNotFromPlatform();
    } else if (error.indexOf("WebSocketNotConnected") !== -1) {
      errorMessage = "WebSocket Connection is disconnected.";
    }
    else if (error.indexOf("already_publishing") !== -1) {
      console.log("**** already publishing:"+reconnecting);
      if(reconnecting) {
        webRTCAdaptor.stop(publishStreamId);

          setTimeout(() => {
            handlePublish(
              publishStreamId,
              publishToken,
              subscriberId,
              subscriberCode
            );
          }, 2000);
      }
    }


    console.log("***** " + error)

  };

  window.makeFullScreen = makeFullScreen;


  function setLocalVideo(localVideo) {
    setLocalVideoLocal(localVideo);
    webRTCAdaptor.mediaManager.localVideo = localVideo;
    webRTCAdaptor.mediaManager.localVideo.srcObject = webRTCAdaptor.mediaManager.localStream;
  }

  function pinVideo(id, videoLabelProp = "") {
    if (id === "localVideo") {
      videoLabelProp = "localVideo";
    }
    // id is for pinning user.
    let videoLabel = videoLabelProp;
    if (videoLabel === "") {
      // if videoLabel is missing try to find it from participants.
      videoLabel = participants.find((p) => id === p.id).videoLabel;
    }
    if (videoLabel === "") {
      // if videoLabel is still missing then we are not going to pin/unpin anyone.
      return;
    }
    // if we already pin the targeted user then we are going to remove it from pinned video.
    if (pinnedVideoId === id) {
      setPinnedVideoId(null);
      handleNotifyUnpinUser(id);
      webRTCAdaptor.assignVideoTrack(videoLabel, id, false);
    }
    // if there is no pinned video we are gonna pin the targeted user.
    // and we need to inform pinned user.
    else {
      setPinnedVideoId(id);
      handleNotifyPinUser(id);
      webRTCAdaptor.assignVideoTrack(videoLabel, id, true);
    }
  }

  function handleNotifyPinUser(id) {
    if (id === "localVideo") {
      // if we pin local video then we are not going to inform anyone.
      return;
    }
    // If I PIN USER then i am going to inform pinned user.
    // Why? Because if i pin someone, pinned user's resolution has to change for better visibility.
    handleSendNotificationEvent("PIN_USER", publishStreamId, {
      streamId: id,
    });
  }

  function handleNotifyUnpinUser(id) {
    // If I UNPIN USER then i am going to inform pinned user.
    // Why? We need to decrease resolution for pinned user's internet usage.
    handleSendNotificationEvent("UNPIN_USER", publishStreamId, {
      streamId: id,
    });
  }

  function handleSetMaxVideoTrackCount(maxTrackCount) {
    if (publishStreamId) {
      webRTCAdaptor.setMaxVideoTrackCount(publishStreamId, maxTrackCount);
      //globals.maxVideoTrackCount = maxTrackCount;
    }
  }

  function enableDisableMCU(isMCUEnabled) {
    if (isMCUEnabled) {
      setRoomJoinMode(JoinModes.MCU);
    } else {
      setRoomJoinMode(JoinModes.MULTITRACK);
    }
  }
  function handleStartScreenShare() {
    webRTCAdaptor.switchDesktopCapture(publishStreamId)
      .then(() => {
        screenShareOnNotification();
      });
  }

  function screenShareOffNotification() {
    handleSendNotificationEvent(
      "SCREEN_SHARED_OFF",
      publishStreamId
    );
    //if I stop my screen share and if i have pin someone different from myself it just should not effect my pinned video.
    if (pinnedVideoId === "localVideo") {
      setPinnedVideoId(null);
    }
  }
  function screenShareOnNotification() {
    setIsScreenShared(true);
    let requestedMediaConstraints = {
      width: 1920,
      height: 1080,
    };
    webRTCAdaptor.applyConstraints(publishStreamId, requestedMediaConstraints);
    handleSendNotificationEvent(
      "SCREEN_SHARED_ON",
      publishStreamId
    );

    setPinnedVideoId("localVideo");
  }

  function turnOffYourMicNotification(participantId) {
    handleSendNotificationEvent(
      "TURN_YOUR_MIC_OFF",
      publishStreamId,
      {
        streamId: participantId,
        senderStreamId: publishStreamId
      }
    );
  }

  function displayPoorNetworkConnectionWarning() {
    if(last_warning_time == null || Date.now() - last_warning_time >  1000 * 30){
      last_warning_time = Date.now();
      displayWarning("Your connection is not stable. Please check your internet connection!");
    }
  }

  function displayWarning(message) {
    enqueueSnackbar(
      {
        message: message,
        variant: "info",
        icon: <SvgIcon size={24} name={'report'} color="red" />
      },
      {
        autoHideDuration: 5000,
        anchorOrigin: {
          vertical: "top",
          horizontal: "right",
        },
      }
    );
  }

  function handleScreenshareNotFromPlatform() {
    if (typeof webRTCAdaptor !== "undefined") {
      setIsScreenShared(false);
      if (
        cam.find(
          (c) => c.eventStreamId === "localVideo" && c.isCameraOn === false
        )
      ) {
        webRTCAdaptor.turnOffLocalCamera(publishStreamId);
      } else {
        webRTCAdaptor.switchVideoCameraCapture(publishStreamId);
      }
      screenShareOffNotification();
      let requestedMediaConstraints = {
        width: 320,
        height: 240,
      };
      webRTCAdaptor.applyConstraints(publishStreamId, requestedMediaConstraints);
      setCloseScreenShare(false);
    } else {
      setCloseScreenShare(true);
    }
  }
  function handleStopScreenShare() {
    setIsScreenShared(false);
    if (
      cam.find(
        (c) => c.eventStreamId === "localVideo" && c.isCameraOn === false
      )
    ) {
      webRTCAdaptor.turnOffLocalCamera(publishStreamId);
    } else {
      webRTCAdaptor.switchVideoCameraCapture(publishStreamId);

      // isCameraOff = true;
    }
    screenShareOffNotification();
  }
  function handleSetMessages(newMessage) {
    setMessages((oldMessages) => {
      let lastMessage = oldMessages[oldMessages.length - 1]; //this must remain mutable
      const isSameUser = lastMessage?.name === newMessage?.name;
      const sentInSameTime = lastMessage?.date === newMessage?.date;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      newMessage.date = new Date(newMessage?.date).toLocaleString(getLang(), { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
      calculate_scroll_height();
      if (isSameUser && sentInSameTime) {
        //group the messages *sent back to back in the same timeframe by the same user* by joinig the new message text with new line
        lastMessage.message = lastMessage.message + "\n" + newMessage.message;
        return [...oldMessages]; // don't make this "return oldMessages;" this is to trigger the useEffect for scroll bottom and get over showing the last prev state do
      } else {
        return [...oldMessages, newMessage];
      }
    });
  }

  function getLang() {
    if (navigator.languages !== undefined)
      return navigator.languages[0];
    return navigator.language;
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (closeScreenShare) {
      handleScreenshareNotFromPlatform();
    }
  }, [closeScreenShare]);  // eslint-disable-line react-hooks/exhaustive-deps

  function scrollToBottom() {
    let objDiv = document.getElementById("paper-props");
    if (objDiv  && scroll_down && objDiv.scrollHeight > objDiv.clientHeight) {
      objDiv.scrollTo(0, objDiv.scrollHeight);
      scrollThreshold = 0.95;
      scroll_down = false;
    }

  }
  function handleMessageDrawerOpen(open) {
    closeSnackbar();
    setMessageDrawerOpen(open);
    if (open) {
      setParticipantListDrawerOpen(false);
    }
  }

  function handleParticipantListOpen(open) {
    setParticipantListDrawerOpen(open);
    if (open) {
      setMessageDrawerOpen(false);
    }
  }

  function handleSendMessage(message) {
    if (publishStreamId) {
      let iceState = webRTCAdaptor.iceConnectionState(publishStreamId);
      if (
        iceState !== null &&
        iceState !== "failed" &&
        iceState !== "disconnected"
      ) {
        if (message === "debugme") {
          webRTCAdaptor.getDebugInfo(publishStreamId);
          return;
        } else if (message === "clearme") {
          setMessages([]);
          return;
        }


        webRTCAdaptor.sendData(
          publishStreamId,
          JSON.stringify({
            eventType: "MESSAGE_RECEIVED",
            message: message,
            name: streamName,
            date: new Date().toString()
          })
        );
      }
    }
  }

  function handleDebugInfo(debugInfo) {
    var infoText = "Client Debug Info\n";
    infoText += "Events:\n";
    infoText += JSON.stringify(globals.trackEvents) + "\n";
    infoText += "Participants (" + participants.length + "):\n\n";
    infoText += JSON.stringify(participants) + "\n\n";
    infoText += "All Participants (" + Object.keys(allParticipants).length + "):\n";
    Object.entries(allParticipants).forEach(([key, value]) => {
      infoText += "- " + key + "\n";
   });
    //infoText += JSON.stringify(allParticipants) + "\n";
    infoText += "----------------------\n";
    infoText += debugInfo;

    //fake message to add chat
    var obj = {
      streamId: publishStreamId,
      data: JSON.stringify({
        eventType: "MESSAGE_RECEIVED",
        name: "Debugger",
        date: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        message: infoText,
      }),
    };

    handleNotificationEvent(obj);
  }

  function toggleSetCam(data) {
    setCam((camList) => {
      let arr = _.cloneDeep(camList);
      let camObj = arr.find((c) => c.eventStreamId === data.eventStreamId);

      if (camObj) {
        camObj.isCameraOn = data.isCameraOn;
      } else {
        arr.push(data);
      }

      if (data.eventStreamId === "localVideo") {
        updateUserStatusMetadata(null, data.isCameraOn);
      }

      return arr;
    });
  }

  function toggleSetMic(data) {
    setMic((micList) => {
      let arr = _.cloneDeep(micList);
      let micObj = arr.find((c) => c.eventStreamId === data.eventStreamId);

      if (micObj) {
        micObj.isMicMuted = data.isMicMuted;
      } else {
        arr.push(data);
      }

      if (data.eventStreamId === "localVideo") {
        updateUserStatusMetadata(data.isMicMuted, null);
      }

      return arr;
    });
  }
  function toggleSetNumberOfUnreadMessages(numb) {
    setNumberOfUnReadMessages(numb);
  }
  function calculate_scroll_height(){
    let objDiv = document.getElementById("paper-props");
    if (objDiv) {
      let scrollPosition = objDiv.scrollTop / (objDiv.scrollHeight - objDiv.clientHeight);
      if (scrollPosition > scrollThreshold) {
        scroll_down = true;
      }
  }
}
  function handleNotificationEvent(obj) {
    var notificationEvent = JSON.parse(obj.data);
    if (notificationEvent != null && typeof notificationEvent == "object") {
      var eventStreamId = notificationEvent.streamId;
      var eventType = notificationEvent.eventType;

      if (eventType === "CAM_TURNED_OFF") {
        toggleSetCam({
          eventStreamId: eventStreamId,
          isCameraOn: false,
        });
      } else if (eventType === "CAM_TURNED_ON") {
        toggleSetCam({
          eventStreamId: eventStreamId,
          isCameraOn: true,
        });
      } else if (eventType === "MIC_MUTED") {
        toggleSetMic({
          eventStreamId: eventStreamId,
          isMicMuted: true,
        });
      } else if (eventType === "MIC_UNMUTED") {
        toggleSetMic({
          eventStreamId: eventStreamId,
          isMicMuted: false,
        });
      } else if (eventType === "MESSAGE_RECEIVED") {
        calculate_scroll_height();
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        notificationEvent.date = new Date(notificationEvent?.date).toLocaleString(getLang(), { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
        // if message arrives.
        // if there is an new message and user has not opened message component then we are going to increase number of unread messages by one.
        // we are gonna also send snackbar.
        if (!messageDrawerOpen) {
          enqueueSnackbar(
            {
              sender: notificationEvent.name,
              message: notificationEvent.message,
              variant: "message",
              onClick: () => {
                handleMessageDrawerOpen(true);
                setNumberOfUnReadMessages(0);
              },
            },
            {
              autoHideDuration: 5000,
              anchorOrigin: {
                vertical: "top",
                horizontal: "right",
              },
            }
          );
          setNumberOfUnReadMessages((numb) => numb + 1);
        }
        setMessages((oldMessages) => {
          let lastMessage = oldMessages[oldMessages.length - 1]; //this must remain mutable
          const isSameUser = lastMessage?.name === notificationEvent?.name;
          const sentInSameTime = lastMessage?.date === notificationEvent?.date;

          if (isSameUser && sentInSameTime) {
            //group the messages *sent back to back in the same timeframe by the same user* by joinig the new message text with new line
            lastMessage.message =
              lastMessage.message + "\n" + notificationEvent.message;
            return [...oldMessages]; // dont make this "return oldMessages;" this is to trigger the useEffect for scroll bottom and get over showing the last prev state do
          } else {
            return [...oldMessages, notificationEvent];
          }
        });
      } else if (eventType === "SCREEN_SHARED_ON") {
        let videoLab = participants.find((p) => p.id === eventStreamId)
          ?.videoLabel
          ? participants.find((p) => p.id === eventStreamId).videoLabel
          : "";
        pinVideo(eventStreamId, videoLab);
        setScreenSharedVideoId(eventStreamId);
      } else if (eventType === "SCREEN_SHARED_OFF") {
        setScreenSharedVideoId(null);
        setPinnedVideoId(null);
      } else if (eventType === "TURN_YOUR_MIC_OFF") {
        console.warn(notificationEvent.senderStreamId, "muted you");
        if(publishStreamId === notificationEvent.streamId) {
          toggleSetMic({
            eventStreamId: 'localVideo',
            isMicMuted: true,
          });
          webRTCAdaptor.muteLocalMic();
          handleSendNotificationEvent(
            "MIC_MUTED",
            publishStreamId
          );
        }
      }
      else if (eventType === "UPDATE_STATUS") {
        setUserStatus(notificationEvent, eventStreamId);
      } else if (eventType === "PIN_USER") {
        if (
          notificationEvent.streamId === publishStreamId &&
          !isScreenShared
        ) {
          let requestedMediaConstraints = {
            width: 640,
            height: 480,
          };
          webRTCAdaptor.applyConstraints(
            publishStreamId,
            requestedMediaConstraints
          );
        }
      } else if (eventType === "UNPIN_USER") {
        if (
          notificationEvent.streamId === publishStreamId &&
          !isScreenShared
        ) {
          let requestedMediaConstraints = {
            width: 320,
            height: 240,
          };
          webRTCAdaptor.applyConstraints(
            publishStreamId,
            requestedMediaConstraints
          );
        }
      } else if (eventType === "VIDEO_TRACK_ASSIGNMENT_LIST") {
        console.debug("VIDEO_TRACK_ASSIGNMENT_LIST -> ", obj);

        let videoTrackAssignments = notificationEvent.payload;

        let temp = participants;

        //remove not available videotracks if exist
        temp.forEach((p) => {
          let assignment = videoTrackAssignments.find((vta) => p.videoLabel === vta.videoLabel);
          if(assignment === undefined) {
            temp = temp.slice(temp.findIndex(p), 1);
          }
        });

        //add and/or update participants according to current assignments
        videoTrackAssignments.forEach((vta) => {
          temp.forEach((p) => {
            if(p.videoLabel === vta.videoLabel) {
              p.streamId = vta.trackId;
              let broadcastObject = allParticipants[p.streamId];
              if(broadcastObject) {
                p.name = broadcastObject.name;
              }
            }
          });
        });
        setParticipants(temp);
        setParticipantUpdated(!participantUpdated);
      } else if (eventType === "AUDIO_TRACK_ASSIGNMENT") {
        clearInterval(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          setTalkers([]);
        }, 1000);
        setTalkers((oldTalkers) => {
          const newTalkers = notificationEvent.payload
            .filter(
              (p) =>
                p.trackId !== "" &&
                screenSharedVideoId !== p.trackId &&
                p.audioLevel !== 0
            )
            .map((p) => p.trackId);
          return _.isEqual(oldTalkers, newTalkers) ? oldTalkers : newTalkers;
        });
      } else if (eventType === "TRACK_LIST_UPDATED") {
        console.debug("TRACK_LIST_UPDATED -> ", obj);

        webRTCAdaptor.getBroadcastObject(roomName);
      }
    }
  }

  function getUserStatusMetadata(isMicMuted, isCameraOn) {
    let metadata = {
      isMicMuted: isMicMuted,
      isCameraOn: isCameraOn,
      isScreenShared: isScreenShared
    }

    if (metadata.isMicMuted === null) {
      metadata.isMicMuted = !!mic.find((c) => c.eventStreamId === "localVideo")?.isMicMuted;
    }
    if (metadata.isCameraOn === null) {
      metadata.isCameraOn = !!cam.find((c) => c.eventStreamId === "localVideo")?.isCameraOn;
    }

    return metadata;
  }

  function updateUserStatusMetadata(micMuted, cameraOn) {
    let metadata = getUserStatusMetadata(micMuted, cameraOn);
    webRTCAdaptor.updateStreamMetaData(publishStreamId, JSON.stringify(metadata));
  }

  function setUserStatus(notificationEvent, eventStreamId) {
    if (notificationEvent.isScreenShared) {
      // if the participant was already pin someone than we should not update it
      if (!screenSharedVideoId) {
        setScreenSharedVideoId(eventStreamId);
        let videoLab = participants.find((p) => p.id === eventStreamId)
          ?.videoLabel
          ? participants.find((p) => p.id === eventStreamId).videoLabel
          : "";
        pinVideo(eventStreamId, videoLab);
      }
    }

    if (!isScreenShared && participants.find((p) => p.id === eventStreamId)) {
      if (!mic.find((m) => m.eventStreamId === eventStreamId)) {
        toggleSetMic({
          eventStreamId: eventStreamId,
          isMicMuted: notificationEvent.mic,
        });
      }
      if (!cam.find((m) => m.eventStreamId === eventStreamId)) {
        toggleSetCam({
          eventStreamId: eventStreamId,
          isCameraOn: notificationEvent.camera,
        });
      }
    }
  }
  function handleLeaveFromRoom() {
    // we need to empty participant array. i f we are going to leave it in the first place.
    setParticipants([]);

    webRTCAdaptor.stop(publishStreamId);
    webRTCAdaptor.stop(roomName);

    clearInterval(audioListenerIntervalJob);


    webRTCAdaptor.turnOffLocalCamera(publishStreamId);
    setWaitingOrMeetingRoom("waiting");
  }
  function handleSendNotificationEvent(eventType, publishStreamId, info) {
    let notEvent = {
      streamId: publishStreamId,
      eventType: eventType,
      ...(info ? info : {}),
    };
    console.error("send notification event", notEvent);
    webRTCAdaptor.sendData(publishStreamId, JSON.stringify(notEvent));
  }

  /*
  function updateStatus(obj) {
    if (roomName !== obj) {
      handleSendNotificationEvent("UPDATE_STATUS", publishStreamId, {
        mic: !!mic.find((c) => c.eventStreamId === "localVideo")?.isMicMuted,
        camera: !!cam.find((c) => c.eventStreamId === "localVideo")?.isCameraOn,
        isPinned:
          pinnedVideoId === "localVideo" ? publishStreamId : pinnedVideoId,
        isScreenShared: isScreenShared,
      });
    }
  }

   */

  function handlePublish(publishStreamId, token, subscriberId, subscriberCode) {
    let userStatusMetadata = getUserStatusMetadata(null, null);

    webRTCAdaptor.publish(
      publishStreamId,
      token,
      subscriberId,
      subscriberCode,
      streamName,
      roomName,
      JSON.stringify(userStatusMetadata)
    );
  }
  function handlePlayVideo(obj) {
    let index = obj?.trackId?.substring("ARDAMSx".length);
    globals.trackEvents.push({ track: obj.track.id, event: "added" });

    if (obj.track.kind === "audio") {
      var newAudioTrack = {
        id: index,
        track: obj.track,
        streamId: obj.streamId
      };

      //append new audio track, track id should be unique because of audio traack limitation
      let temp = audioTracks;
      temp.push(newAudioTrack);
      setAudioTracks(temp);
    }
    else if (obj.track.kind === "video"){
        let newVideoTrack = {
          id: index,
          videoLabel: index,
          track: obj.track,
          isCameraOn: true,
          streamId: obj.streamId,
          name: ""
        };
        //append new video track, track id should be unique because of video traack limitation
        let temp = participants;
        temp.push(newVideoTrack);
        setParticipants(temp);
    }
  }

  function setVirtualBackgroundImage(imageUrl) {
    let virtualBackgroundImage = document.createElement("img");
    virtualBackgroundImage.id = "virtualBackgroundImage";
    virtualBackgroundImage.style.visibility = "hidden";
    virtualBackgroundImage.alt = "virtual-background";

    if (imageUrl !== undefined && imageUrl !== null && imageUrl !== "") {
      virtualBackgroundImage.src = imageUrl;
    } else {
      virtualBackgroundImage.src = "virtual-background.png";
    }

    setVirtualBackground(virtualBackgroundImage);
    webRTCAdaptor.setBackgroundImage(virtualBackgroundImage);
  }

  function handleBackgroundReplacement(option) {
    let effectName;

    if (option === "none") {
      effectName = VideoEffect.NO_EFFECT;
      setIsVideoEffectRunning(false);
    }
    else if (option === "blur") {
      effectName = VideoEffect.BLUR_BACKGROUND;
      setIsVideoEffectRunning(true);
    }
    else if (option === "background") {
      if (virtualBackground === null) {
        setVirtualBackgroundImage(null);
      }
      effectName = VideoEffect.VIRTUAL_BACKGROUND
      setIsVideoEffectRunning(true);
    }
    webRTCAdaptor.enableEffect(effectName).then(() => {
      console.log("Effect: " + effectName + " is enabled");
    }).catch(err => {
      console.error("Effect: " + effectName + " is not enabled. Error is " + err);
      setIsVideoEffectRunning(false);
    });
  }
  function checkAndTurnOnLocalCamera(streamId) {
    if (isVideoEffectRunning) {
      webRTCAdaptor.mediaManager.localStream.getVideoTracks()[0].enabled = true;
    }
    else {
      webRTCAdaptor.turnOnLocalCamera(streamId);
    }
  }

  function checkAndTurnOffLocalCamera(streamId) {
    if (isVideoEffectRunning) {
      webRTCAdaptor.mediaManager.localStream.getVideoTracks()[0].enabled = false;
    }
    else {
      webRTCAdaptor.turnOffLocalCamera(streamId);
    }
  }

  function getSelectedDevices() {
    let devices = {
      videoDeviceId: selectedCamera,
      audioDeviceId: selectedMicrophone
    }
    return devices;
  }

  function setSelectedDevices(devices) {
    if (devices.videoDeviceId !== null && devices.videoDeviceId !== undefined) {
      setSelectedCamera(devices.videoDeviceId);
    }
    if (devices.audioDeviceId !== null && devices.audioDeviceId !== undefined) {
      setSelectedMicrophone(devices.audioDeviceId);
    }
  }

  function cameraSelected(value) {
    if(selectedCamera !== value) {
      setSelectedCamera(value);
      // When we first open home page, React will call this function and local stream is null at that time.
      // So, we need to catch the error.
      try {
        webRTCAdaptor.switchVideoCameraCapture(publishStreamId, value);
      } catch (e) {
        console.log("Local stream is not ready yet.");
      }
    }
  }

  function microphoneSelected(value) {
    setSelectedMicrophone(value);
    // When we first open home page, React will call this function and local stream is null at that time.
    // So, we need to catch the error.
    try {
      webRTCAdaptor.switchAudioInputSource(publishStreamId, value);
    } catch (e) {
      console.log("Local stream is not ready yet.");
    }
  }

  function muteLocalMic() {
    webRTCAdaptor.muteLocalMic();
  }

  function unmuteLocalMic() {
    webRTCAdaptor.unmuteLocalMic();
  }

  function setAudioLevelListener(listener, period) {
    if (audioListenerIntervalJob == null) {
      audioListenerIntervalJob = setInterval(() => {
        /*
        webRTCAdaptor.remotePeerConnection[publishStreamId].getStats(null).then(stats => {
          for (const stat of stats.values())
          {
            if (stat.type === 'media-source' && stat.kind === 'audio') {
              listener(stat.audioLevel.toFixed(2));
            }
          }
        })
        */ //FIXME
      }, period);
    }
  }

  return (!initialized ? <>
    <Grid
        container
        spacing={0}
        direction="column"
        alignItems="center"
        justifyContent="center"
        style={{ minHeight: '100vh' }}
      >
        <Grid item xs={3}>
        <Box sx={{ display: 'flex' }}>
          <CircularProgress size="4rem" />
        </Box>
        </Grid>
      </Grid>
    </> :
    <Grid container className="App">
      <Grid
        container
        className="App-header"
        justifyContent="center"
        alignItems={"center"}
      >
        <ConferenceContext.Provider
          value={{
            isScreenShared,
            mic,
            cam,
            talkers,
            screenSharedVideoId,
            roomJoinMode,
            audioTracks,
            isPublished,
            selectedCamera,
            selectedMicrophone,
            selectedBackgroundMode,
            participants,
            messageDrawerOpen,
            participantListDrawerOpen,
            messages,
            numberOfUnReadMessages,
            pinnedVideoId,
            participantUpdated,
            allParticipants,
            globals,
            isPlayOnly,
            localVideo,
            streamName,
            initialized,
            devices,
            publishStreamId,

            setSelectedBackgroundMode,
            setIsVideoEffectRunning,
            setParticipants,
            toggleSetMic,
            toggleSetCam,
            handleMessageDrawerOpen,
            handleParticipantListOpen,
            setSelectedCamera,
            setSelectedMicrophone,
            setLeftTheRoom,
            joinRoom,
            handleStopScreenShare,
            handleStartScreenShare,
            cameraSelected,
            microphoneSelected,
            handleBackgroundReplacement,
            muteLocalMic,
            unmuteLocalMic,
            checkAndTurnOnLocalCamera,
            checkAndTurnOffLocalCamera,
            setAudioLevelListener,
            handleSetMessages,
            toggleSetNumberOfUnreadMessages,
            pinVideo,
            setLocalVideo,
            setWaitingOrMeetingRoom,
            setStreamName,
            handleLeaveFromRoom,
            handleSendNotificationEvent,
            handleSetMaxVideoTrackCount,
            screenShareOffNotification,
            handleSendMessage,
            turnOffYourMicNotification
          }}
        >
          <SnackbarProvider
            anchorOrigin={{
              vertical: "top",
              horizontal: "center",
            }}
            maxSnack={3}
            content={(key, notificationData) => (
              <AntSnackBar id={key} notificationData={notificationData} />
            )}
          >
            {leftTheRoom ? (
              <LeftTheRoom />
            ) : waitingOrMeetingRoom === "waiting" ? (
              <WaitingRoom />
            ) : (
              <>
                <MeetingRoom />
                <MessageDrawer />
                <ParticipantListDrawer />
              </>
            )}
          </SnackbarProvider>
        </ConferenceContext.Provider>
      </Grid>
    </Grid>
  );
}

export default AntMedia;
