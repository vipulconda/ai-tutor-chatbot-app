"use client";

import { useState, useRef, useCallback } from "react";

export interface VoiceRecorderState {
  isRecording: boolean;
  isProcessing: boolean;
  error: string | null;
}

export interface UseVoiceRecorderReturn {
  state: VoiceRecorderState;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  toggleRecording: () => Promise<void>;
  transcribeAudioFile: (file: File) => Promise<boolean>;
}

/**
 * Hook for recording voice via MediaRecorder and transcribing via Whisper API.
 *
 * @param onTranscript - Callback called with the transcribed text
 * @returns Recording controls and state
 */
export function useVoiceRecorder(
  onTranscript: (text: string) => void,
  onAudioFile?: (file: File) => void
): UseVoiceRecorderReturn {
  const [state, setState] = useState<VoiceRecorderState>({
    isRecording: false,
    isProcessing: false,
    error: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
  }, []);

  const transcribeAudioFile = useCallback(
    async (file: File): Promise<boolean> => {
      setState((s) => ({ ...s, isProcessing: true, error: null }));

      try {
        const formData = new FormData();
        formData.append("file", file, file.name || "audio.webm");

        const res = await fetch("/api/ai/transcribe", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          let errorMessage = "Transcription failed. Please try again.";
          try {
            const errorData = await res.json();
            if (typeof errorData?.error === "string" && errorData.error.trim()) {
              errorMessage = errorData.error;
            }
          } catch {
            // Ignore JSON parsing failures for non-JSON error bodies.
          }
          setState((s) => ({
            ...s,
            isProcessing: false,
            error: errorMessage,
          }));
          return false;
        }

        const data = await res.json();
        if (data.text) {
          onTranscript(data.text);
        }

        setState((s) => ({ ...s, isProcessing: false, error: null }));
        return true;
      } catch {
        setState((s) => ({
          ...s,
          isProcessing: false,
          error: "Failed to process audio.",
        }));
        return false;
      }
    },
    [onTranscript]
  );

  const startRecording = useCallback(async () => {
    setState({ isRecording: false, isProcessing: false, error: null });

    try {
      if (typeof window === "undefined" || typeof navigator === "undefined") {
        setState({
          isRecording: false,
          isProcessing: false,
          error: "Audio recording is not available in this environment.",
        });
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setState({
          isRecording: false,
          isProcessing: false,
          error: "Your browser does not support microphone recording.",
        });
        return;
      }

      if (typeof MediaRecorder === "undefined") {
        setState({
          isRecording: false,
          isProcessing: false,
          error: "Your browser does not support in-browser audio recording.",
        });
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const preferredMimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ];
      const supportedMimeType = preferredMimeTypes.find((mimeType) =>
        MediaRecorder.isTypeSupported(mimeType)
      );
      const mediaRecorder = supportedMimeType
        ? new MediaRecorder(stream, { mimeType: supportedMimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onerror = () => {
        cleanup();
        setState({
          isRecording: false,
          isProcessing: false,
          error: "Recording failed. Please try again.",
        });
      };

      mediaRecorder.onstop = async () => {
        setState((s) => ({ ...s, isRecording: false, isProcessing: true }));

        if (audioChunksRef.current.length === 0) {
          cleanup();
          setState({
            isRecording: false,
            isProcessing: false,
            error: "No audio was captured. Please try again and speak a little longer.",
          });
          return;
        }

        const mimeType =
          mediaRecorder.mimeType ||
          audioChunksRef.current[0]?.type ||
          "audio/webm";
        const extension =
          mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mimeType,
        });
        cleanup();

        const recordedFile = new File([audioBlob], `recording.${extension}`, {
          type: mimeType,
        });
        onAudioFile?.(recordedFile);
        await transcribeAudioFile(recordedFile);
      };

      mediaRecorder.start(250);
      setState({ isRecording: true, isProcessing: false, error: null });
    } catch {
      setState({
        isRecording: false,
        isProcessing: false,
        error: "Microphone access denied. Please enable it in your browser settings.",
      });
    }
  }, [cleanup, onAudioFile, transcribeAudioFile]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      try {
        mediaRecorderRef.current.requestData();
      } catch {
        // Ignore browsers that do not support requesting buffered data.
      }
      mediaRecorderRef.current.stop();
    }
  }, []);

  const toggleRecording = useCallback(async () => {
    if (state.isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  }, [state.isRecording, startRecording, stopRecording]);

  return {
    state,
    startRecording,
    stopRecording,
    toggleRecording,
    transcribeAudioFile,
  };
}
