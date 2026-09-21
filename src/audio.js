import { Platform } from "react-native";
import {
  AudioModule,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  getRecordingPermissionsAsync,
  requestNotificationPermissionsAsync,
  RecordingPresets,
  createAudioPlayer,
} from "expo-audio";

export function isAudioFile(mimeType, fileName) {
  if (mimeType && mimeType.startsWith("audio/")) return true;
  if (!fileName) return false;
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ["m4a", "mp3", "wav", "aac", "ogg", "flac", "wma", "opus", "amr", "caf"].includes(ext);
}

export function formatDuration(millis) {
  if (!millis || millis <= 0 || isNaN(millis)) return "0:00";
  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return `${hours}:${remMinutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export async function requestAudioPermissions() {
  const perm = await getRecordingPermissionsAsync();
  let micGranted = perm.granted;
  if (!micGranted) {
    const res = await requestRecordingPermissionsAsync();
    micGranted = res.granted;
  }

  // Android 13+ requires notification permission for foreground services
  if (micGranted && Platform.OS === "android") {
    try {
      await requestNotificationPermissionsAsync();
    } catch {}
  }

  return micGranted;
}

export async function startRecording({ onProgress } = {}) {
  const granted = await requestAudioPermissions();
  if (!granted) {
    throw new Error("Microphone permission was denied. Please allow microphone access to record audio evidence.");
  }

  // Enable background recording and background audio session
  await setAudioModeAsync({
    allowsRecording: true,
    allowsBackgroundRecording: true,
    shouldPlayInBackground: true,
    playsInSilentMode: true,
  });

  const recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
  await recorder.prepareToRecordAsync();
  recorder.record();
  recorder._startTime = Date.now();

  if (onProgress) {
    const interval = setInterval(() => {
      try {
        const state = recorder.getStatus();
        if (state.isRecording) {
          const duration = (typeof state.durationMillis === "number" && state.durationMillis > 0)
            ? state.durationMillis
            : Date.now() - recorder._startTime;
          onProgress(duration);
        }
      } catch {}
    }, 250);
    recorder._interval = interval;
  }

  return recorder;
}

export async function stopRecording(recorder) {
  if (!recorder) return null;
  if (recorder._interval) {
    clearInterval(recorder._interval);
  }

  let durationMillis = 0;
  try {
    const state = recorder.getStatus();
    durationMillis = state.durationMillis || (recorder.currentTime ? Math.round(recorder.currentTime * 1000) : 0);
  } catch {}

  if (!durationMillis && recorder._startTime) {
    durationMillis = Date.now() - recorder._startTime;
  }

  await recorder.stop();

  try {
    await setAudioModeAsync({
      allowsRecording: false,
      allowsBackgroundRecording: false,
      playsInSilentMode: true,
    });
  } catch {}

  const uri = recorder.uri;
  return { uri, durationMillis };
}

export async function cancelRecording(recorder) {
  if (!recorder) return;
  if (recorder._interval) {
    clearInterval(recorder._interval);
  }
  try {
    await recorder.stop();
  } catch {}
  try {
    await setAudioModeAsync({
      allowsRecording: false,
      allowsBackgroundRecording: false,
    });
  } catch {}
}

export async function inspectAudioDuration(uri) {
  try {
    const player = createAudioPlayer(uri);
    let duration = player.duration;
    if (!duration || duration <= 0) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      duration = player.duration;
    }
    player.remove();
    return duration ? Math.round(duration * 1000) : null;
  } catch {
    return null;
  }
}
