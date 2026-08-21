/* eslint-disable */
import VideoCard from "Components/Cards/VideoCard";
import OthersCard from "Components/Cards/OthersCard";
import React from "react";
import {isMobile} from "react-device-detect";
import TalkingIndicator from "../Components/TalkingIndicator";

function LayoutPinned (props) {

  const pinnedParticipant = props.videoTrackAssignments.find(e => e.streamId === props.pinnedParticipant?.streamId);

  let MAX_VIDEO_AT_SIDE = 4;

  let trackCount = Math.min(props.globals.desiredTileCount-1, MAX_VIDEO_AT_SIDE);

  const showOthers = Object.keys(props.allParticipants).length > trackCount + 1; //one video is pinned

  props.updateMaxVideoTrackCount(showOthers ? trackCount - 1 : trackCount);


  let playingParticipantsCount = 0;

  //if we need to show others card, then we don't show the last video to hold place for the others card. but should show you.
  const maxPlayingParticipantsCount = showOthers ? Math.max(2, trackCount) : Math.min(props.videoTrackAssignments.length, MAX_VIDEO_AT_SIDE);
  const playingParticipants = [];

  const pinnedVideo = () => {
    let pinnedParticipantName;
    if(pinnedParticipant !== undefined) {
      playingParticipants.push(props.videoTrackAssignments.find(e => e.streamId === pinnedParticipant.streamId));
      pinnedParticipantName = props?.allParticipants[pinnedParticipant.streamId]?.name;
    }

    // Infinity mirror blocker: Check if the pinned stream is the local user's screen share
    // and whether we should hide it to prevent the infinity mirror effect.
    // The overlay only appears when:
    // 1. The pinned participant is the local user's presentation (streamId ends with "_presentation")
    // 2. The user shared their entire screen or browser window (isEntireScreenShared)
    // 3. The user is currently looking at this meeting window (isWindowFocused)
    const isLocalPresentation = pinnedParticipant?.streamId
      && props?.publishStreamId
      && pinnedParticipant.streamId === props.publishStreamId + "_presentation";

    const shouldShowInfinityMirrorOverlay = isLocalPresentation
      && props?.isEntireScreenShared
      && props?.isWindowFocused;

    /* istanbul ignore next */
    return (
      pinnedParticipant ? (
        <div className="single-video-container pinned keep-ratio">
          <div style={{position: "relative", width: "100%", height: "100%"}}>
            <TalkingIndicator
                trackAssignment={pinnedParticipant}
                isTalking={props?.isTalking}
                streamId={pinnedParticipant.streamId}
                talkers={props?.talkers}
                setAudioLevelListener={props?.setAudioLevelListener}
            />
            <VideoCard
              trackAssignment={pinnedParticipant}
              autoPlay
              name={
                pinnedParticipantName
              }
              pinned
              streamName={props?.streamName}
              isPublished={props?.isPublished}
              isPlayOnly={props?.isPlayOnly}
              isMyMicMuted={props?.isMyMicMuted}
              isMyCamTurnedOff={props?.isMyCamTurnedOff}
              allParticipants={props?.allParticipants}
              setParticipantIdMuted={(participant) => props?.setParticipantIdMuted(participant)}
              turnOnYourMicNotification={(streamId) =>props?.turnOnYourMicNotification(streamId)}
              turnOffYourMicNotification={(streamId) =>props?.turnOffYourMicNotification(streamId)}
              turnOffYourCamNotification={(streamId) =>props?.turnOffYourCamNotification(streamId)}
              pinVideo={(streamId)=>props?.pinVideo(streamId)}
              unpinVideo={props?.unpinVideo}
              isAdmin={props?.isAdmin}
              publishStreamId={props?.publishStreamId}
              localVideo={props?.localVideo}
              localVideoCreate={(tempLocalVideo) => props?.localVideoCreate(tempLocalVideo)}
            />
            {/* Infinity Mirror Blocker Overlay */}
            {shouldShowInfinityMirrorOverlay && (
              <div style={{
                position: "absolute",
                inset: 0,
                backgroundColor: "rgba(31, 41, 55, 0.95)", // gray-800 with slight transparency
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                zIndex: 50,
                padding: "16px"
              }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{marginBottom: "12px", opacity: 0.7}}>
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                  <line x1="8" y1="21" x2="16" y2="21"></line>
                  <line x1="12" y1="17" x2="12" y2="21"></line>
                </svg>
                <p style={{
                  textAlign: "center",
                  fontWeight: "600",
                  fontSize: "1rem",
                  margin: "0 0 8px 0"
                }}>
                  You are presenting your screen
                </p>
                <p style={{
                  textAlign: "center",
                  fontSize: "0.75rem",
                  opacity: 0.6,
                  maxWidth: "280px",
                  margin: 0,
                  lineHeight: "1.4"
                }}>
                  To avoid an infinity mirror, look at the tab or window you want to show. Your audience can see your screen share normally.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null
    )
  }

  const videoCards = (isMobileView) => {
    const sortedVideoAssignments = [...props.videoTrackAssignments].sort((a, b) => {
      const aIsPrioritized = props.priorityParticipants.includes(a.streamId);
      const bIsPrioritized = props.priorityParticipants.includes(b.streamId);

      if (aIsPrioritized && !bIsPrioritized) {
        return -1;
      }
      if (!aIsPrioritized && bIsPrioritized) {
        return 1;
      }
      if (aIsPrioritized && bIsPrioritized) {
        return props.priorityParticipants.indexOf(a.streamId) - props.priorityParticipants.indexOf(b.streamId);
      }
      return 0; // Keep original order for non-prioritized
    });
    return (
      <>
      {
      // eslint-disable-next-line
      sortedVideoAssignments.map((element, index) => {

        let isPlayOnly;

        try {
          isPlayOnly = JSON.parse(props?.allParticipants[element?.streamId]?.metaData)?.isPlayOnly;
        } catch (e) {
          isPlayOnly = false;
        }

        let participantName = props?.allParticipants[element?.streamId]?.name;

        if (participantName === "" || typeof participantName === 'undefined' || isPlayOnly || participantName === "Anonymous") {
          return null;
        }

        if(element?.streamId !== pinnedParticipant?.streamId && playingParticipantsCount < maxPlayingParticipantsCount) {
          playingParticipantsCount ++;
          playingParticipants.push(element);
          /* istanbul ignore next */
          return (
              <div className="unpinned" key={index}>
                <div className="single-video-container">
                  <div style={{position: "relative", width: "100%", height: "100%"}}>
                    <TalkingIndicator
                        trackAssignment={element}
                        isTalking={props?.isTalking}
                        streamId={element.streamId}
                        talkers={props?.talkers}
                        setAudioLevelListener={props?.setAudioLevelListener}
                    />
                    <VideoCard
                        isMobileView={isMobileView}
                        trackAssignment={element}
                        autoPlay
                        name={participantName}
                        streamName={props?.streamName}
                        isPublished={props?.isPublished}
                        isPlayOnly={props?.isPlayOnly}
                        isMyMicMuted={props?.isMyMicMuted}
                        isMyCamTurnedOff={props?.isMyCamTurnedOff}
                        allParticipants={props?.allParticipants}
                        setParticipantIdMuted={(participant) => props?.setParticipantIdMuted(participant)}
                        turnOnYourMicNotification={(streamId) =>props?.turnOnYourMicNotification(streamId)}
                        turnOffYourMicNotification={(streamId) =>props?.turnOffYourMicNotification(streamId)}
                        turnOffYourCamNotification={(streamId) =>props?.turnOffYourCamNotification(streamId)}
                        pinVideo={(streamId)=>props?.pinVideo(streamId)}
                        unpinVideo={props?.unpinVideo}
                        isAdmin={props?.isAdmin}
                        publishStreamId={props?.publishStreamId}
                        localVideo={props?.localVideo}
                        localVideoCreate={(tempLocalVideo) => props?.localVideoCreate(tempLocalVideo)}
                    />
                  </div>
                  </div>
                </div>
                );
                }
                })}
              </>
          );
        }

        const othersCard = () => {
          /* istanbul ignore next */
          return (
              <>
                {showOthers ? (
                    <div className="unpinned">
                      <div className="single-video-container  others-tile-wrapper">
                        <OthersCard
                            publishStreamId={props?.publishStreamId}
                            allParticipants={props?.allParticipants}
                            playingParticipants={playingParticipants}
        />
        </div>
      </div>
        ) : null
      }
      </>
    );
  }

  return (
    <>
      {pinnedVideo()}
      { (!props?.isMobile) ?
          <div id="unpinned-gallery">
            {props?.videoTrackAssignments.length === 0 ? <p>{process.env.REACT_APP_PLAY_ONLY_ROOM_EMPTY_MESSAGE}</p> : null}
            {videoCards(false)}
            {process.env.REACT_APP_LAYOUT_OTHERS_CARD_VISIBILITY === 'true' ? othersCard() : null}
          </div>
          : <><div id="unpinned-gallery">
            {props?.videoTrackAssignments.length === 0 ? <p>{process.env.REACT_APP_PLAY_ONLY_ROOM_EMPTY_MESSAGE}</p> : null}
            {process.env.REACT_APP_LAYOUT_OTHERS_CARD_VISIBILITY === 'true' ? othersCard() : null}
          </div>
            {videoCards(true)}
          </>}
    </>
  );
};

export default LayoutPinned;
