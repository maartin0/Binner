import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button, Icon } from "semantic-ui-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Events } from "../common/events";
import "./CameraScanner.css";

const soundSuccess = new Audio('/audio/scan-success.mp3');
const COOLDOWN_MS = 1500;

export function CameraScanner({ open, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const controlsRef = useRef(null);
  const readerRef = useRef(null);
  const lastScannedRef = useRef(null);
  const lastScannedTimeRef = useRef(0);
  const [cameras, setCameras] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);

  const stopCamera = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  const drawOverlay = useCallback((resultPoints) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !resultPoints || resultPoints.length < 2) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");

    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(resultPoints[0].getX(), resultPoints[0].getY());
    for (let i = 1; i < resultPoints.length; i++) {
      ctx.lineTo(resultPoints[i].getX(), resultPoints[i].getY());
    }
    ctx.closePath();
    ctx.stroke();

    setTimeout(() => {
      canvasRef.current?.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    }, 800);
  }, []);

  const startCamera = useCallback(async (deviceId) => {
    stopCamera();
    if (!readerRef.current) {
      readerRef.current = new BrowserMultiFormatReader();
    }
    try {
      const controls = await readerRef.current.decodeFromVideoDevice(
        deviceId,
        videoRef.current,
        (result) => {
          if (!result) return;
          const text = result.getText();
          const now = Date.now();
          if (text === lastScannedRef.current && now - lastScannedTimeRef.current < COOLDOWN_MS) return;
          lastScannedRef.current = text;
          lastScannedTimeRef.current = now;

          document.body.dispatchEvent(new CustomEvent(Events.BarcodeInput, { detail: text }));
          soundSuccess.play().catch(() => {});
          drawOverlay(result.getResultPoints());
        }
      );
      controlsRef.current = controls;
    } catch (err) {
      console.error("CameraScanner: failed to start camera", err);
    }
  }, [stopCamera, drawOverlay]);

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }

    const launch = async () => {
      // Start with the selected device, or undefined to use the default camera.
      // Passing undefined is what triggers the browser's permission prompt via getUserMedia.
      await startCamera(selectedDeviceId || undefined);
      // Enumerate only after the camera is running so the browser returns valid device IDs.
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        setCameras(devices);
        if (!selectedDeviceId && devices.length > 0 && devices[0].deviceId)
          setSelectedDeviceId(devices[0].deviceId);
      } catch (err) {
        console.error("CameraScanner: failed to list cameras", err);
      }
    };
    launch();
    return stopCamera;
  }, [open, stopCamera]);

  const cycleCamera = () => {
    const idx = cameras.findIndex(c => c.deviceId === selectedDeviceId);
    const nextId = cameras[(idx + 1) % cameras.length].deviceId;
    setSelectedDeviceId(nextId);
    startCamera(nextId);
  };

  if (!open) return null;

  return (
    <div className="camera-scanner-container">
      <div className="camera-preview-wrapper">
        <video ref={videoRef} autoPlay playsInline muted />
        <canvas ref={canvasRef} className="camera-canvas-overlay" />
        <div className="scan-frame-overlay">
          <span className="corner tl" />
          <span className="corner tr" />
          <span className="corner bl" />
          <span className="corner br" />
        </div>
      </div>
      <div className="camera-controls">
        {cameras.length > 1 && (
          <Button icon circular size="small" onClick={cycleCamera} title="Switch camera">
            <Icon name="sync alternate" />
          </Button>
        )}
        <Button icon circular size="small" onClick={onClose} title="Close camera">
          <Icon name="close" />
        </Button>
      </div>
    </div>
  );
}

export default CameraScanner;
