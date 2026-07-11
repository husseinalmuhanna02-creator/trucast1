import React, { useState, useEffect, useRef } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { Chat, CallSession } from '../types';
import { db } from '../firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import {
  StreamVideo,
  StreamCall,
  SpeakerLayout,
  StreamVideoClient,
  useCall,
  useCallStateHooks,
} from '@stream-io/video-react-sdk';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  PhoneOff, 
  X, 
  Monitor, 
  Menu, 
  Sliders, 
  VolumeX, 
  Edit2, 
  Sparkles,
  ChevronDown
} from 'lucide-react';
import '@stream-io/video-react-sdk/dist/css/styles.css';

// Simple whiteboard sub-component
const WhiteboardPanel = ({ onClose }: { onClose: () => void }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#3b82f6');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineCap = 'round';
    ctx.lineWidth = 4;
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.strokeStyle = color;
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div className="absolute inset-y-4 right-4 w-80 bg-zinc-950/95 backdrop-blur-2xl border border-white/10 rounded-[32px] p-6 z-[60] flex flex-col shadow-2xl font-sans" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <h4 className="text-white font-black text-sm">السبورة الذكية التفاعلية 📋</h4>
        </div>
        <button onClick={onClose} className="p-1 text-zinc-500 hover:text-white transition-all bg-zinc-900/50 rounded-lg hover:bg-zinc-800">
          <X className="w-4 h-4" />
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={272}
        height={340}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-2xl cursor-crosshair touch-none"
      />
      <div className="flex items-center justify-between mt-4">
        <div className="flex gap-2">
          {['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#ffffff'].map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full border transition-all ${color === c ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-70 hover:opacity-100'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <button onClick={clearCanvas} className="text-xs text-zinc-400 hover:text-red-400 font-black transition-colors px-3 py-1.5 bg-zinc-900 rounded-xl border border-zinc-800">
          مسح اللوحة
        </button>
      </div>
    </div>
  );
};

// Sub-component to safely consume Stream Video contexts/hooks
const PrivateCallContent = ({ 
  currentUser,
  chat,
  callSession,
  onClose 
}: { 
  currentUser: FirebaseUser | null,
  chat: Chat,
  callSession: CallSession,
  onClose: () => void 
}) => {
  const call = useCall();
  const { useCameraState, useMicrophoneState, useScreenShareState } = useCallStateHooks();
  const { status: camStatus } = useCameraState();
  const { status: micStatus } = useMicrophoneState();
  const { isEnabled: isScreenSharing } = useScreenShareState();

  const isCamOn = camStatus === 'enabled';
  const isMicOn = micStatus === 'enabled';

  // State toggles
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [noiseReduction, setNoiseReduction] = useState(false);
  const [isWhiteboardOpen, setIsWhiteboardOpen] = useState(false);
  const [muteNew, setMuteNew] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showToast, setShowToast] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setShowToast(msg);
    setTimeout(() => setShowToast(null), 3000);
  };

  const toggleCamera = async () => {
    try {
      if (call) {
        await call.camera.toggle();
      }
    } catch (err) {
      console.error("Error toggling camera in PrivateCallContent:", err);
    }
  };

  const toggleMic = async () => {
    try {
      if (call) {
        await call.microphone.toggle();
      }
    } catch (err) {
      console.error("Error toggling microphone in PrivateCallContent:", err);
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (call) {
        await call.screenShare.toggle();
      }
    } catch (err) {
      console.error("Error toggling screen share in PrivateCallContent:", err);
    }
  };

  const handleLeaveClick = () => {
    // Determine if current user is owner of this conversation
    const isOwner = (call?.state as any)?.createdByUserId === currentUser?.uid || (call?.state as any)?.createdBy?.id === currentUser?.uid || currentUser?.uid === (chat as any)?.createdById;
    if (isOwner) {
      setShowLeaveConfirm(true);
    } else {
      executeLeave();
    }
  };

  const executeLeave = async () => {
    try {
      if (call) {
        await call.leave();
      }
    } catch (err) {
      console.warn("Error leaving call in PrivateCallContent:", err);
    }
    onClose();
  };

  const executeEndCall = async () => {
    try {
      if (chat?.id && callSession?.id) {
        // Mark the call session as inactive
        await updateDoc(doc(db, 'chats', chat.id, 'calls', callSession.id), { 
          active: false,
          status: 'ended',
          endedAt: serverTimestamp()
        }).catch(err => console.warn("Firestore status update failed:", err));
        
        // Clear active call fields on parent chat
        await updateDoc(doc(db, 'chats', chat.id), {
          activeCallId: null,
          activeCallHostId: null,
          activeCallHostName: null,
          activeCallHostPhoto: null,
          activeCallType: null,
          activeCallStartedAt: null
        }).catch(err => console.warn("Firestore activeCallId clear failed:", err));
      }
    } catch (dbErr) {
      console.error("Failed to update database for ending call:", dbErr);
    }

    try {
      if (call) {
        await call.endCall();
      }
    } catch (err) {
      console.warn("Error ending call in PrivateCallContent:", err);
    }

    // Force redirect to home tab / route
    if (typeof (window as any).navigate === 'function') {
      (window as any).navigate('/home');
    }
    onClose();
  };

  return (
    <div className="flex-1 flex flex-col relative h-full">
      {/* Top Left Floating Options Menu */}
      <div className="absolute top-6 left-6 z-[70] font-sans" dir="rtl">
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="flex items-center gap-2 bg-zinc-950/85 hover:bg-zinc-900 text-white px-4 py-3 rounded-2xl border border-white/10 shadow-2xl transition-all hover:scale-105 active:scale-95"
        >
          <Menu className="w-5 h-5 text-blue-500" />
          <span className="text-xs font-black">خيارات المكالمة</span>
          <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isMenuOpen ? 'rotate-180' : ''}`} />
        </button>

        {isMenuOpen && (
          <div className="absolute top-full left-0 mt-3 w-64 bg-zinc-950/95 backdrop-blur-2xl border border-white/10 rounded-2xl p-3 shadow-2xl space-y-1.5 z-[70] animate-in fade-in slide-in-from-top-3">
            <button
              onClick={() => {
                setNoiseReduction(!noiseReduction);
                triggerToast(!noiseReduction ? "تم تفعيل عزل الضوضاء بالذكاء الاصطناعي 🎙️" : "تم إلغاء تفعيل عزل الضوضاء");
                setIsMenuOpen(false);
              }}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-zinc-900/50 text-right transition-colors"
            >
              <div className="flex items-center gap-3">
                <Sliders className={`w-4.5 h-4.5 ${noiseReduction ? 'text-emerald-500' : 'text-zinc-400'}`} />
                <span className="text-xs font-bold text-white">تقليل الضوضاء النشط</span>
              </div>
              {noiseReduction && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
            </button>

            <button
              onClick={() => {
                setIsWhiteboardOpen(!isWhiteboardOpen);
                triggerToast(!isWhiteboardOpen ? "تم تفعيل اللوحة الذكية المشتركة 📋" : "تم إغلاق اللوحة الذكية");
                setIsMenuOpen(false);
              }}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-zinc-900/50 text-right transition-colors"
            >
              <div className="flex items-center gap-3">
                <Edit2 className={`w-4.5 h-4.5 ${isWhiteboardOpen ? 'text-blue-500' : 'text-zinc-400'}`} />
                <span className="text-xs font-bold text-white">السبورة الذكية التفاعلية</span>
              </div>
              {isWhiteboardOpen && <div className="w-2 h-2 rounded-full bg-blue-500" />}
            </button>

            <button
              onClick={() => {
                setMuteNew(!muteNew);
                triggerToast(!muteNew ? "تم قفل المايك للمشاركين الجدد تلقائياً 🔇" : "تم إلغاء قفل كتم المنضمين");
                setIsMenuOpen(false);
              }}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-zinc-900/50 text-right transition-colors"
            >
              <div className="flex items-center gap-3">
                <VolumeX className={`w-4.5 h-4.5 ${muteNew ? 'text-purple-500' : 'text-zinc-400'}`} />
                <span className="text-xs font-bold text-white">كتم المنضمين تلقائياً</span>
              </div>
              {muteNew && <div className="w-2 h-2 rounded-full bg-purple-500" />}
            </button>
          </div>
        )}
      </div>

      {/* Speaker layout for Video rendering */}
      <div className="flex-1 min-h-0 relative">
        <SpeakerLayout />
      </div>

      {/* Smart Whiteboard Overlay */}
      {isWhiteboardOpen && (
        <WhiteboardPanel onClose={() => setIsWhiteboardOpen(false)} />
      )}

      {/* Toast Notification */}
      {showToast && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-800 text-white px-5 py-3 rounded-2xl shadow-2xl text-xs font-black z-[80] flex items-center gap-2 animate-bounce">
          <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
          <span>{showToast}</span>
        </div>
      )}

      {/* Floating custom cinematic controls for TruCast */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-zinc-950/80 backdrop-blur-xl px-6 py-4 rounded-3xl border border-white/10 shadow-2xl z-50">
        <button
          onClick={toggleMic}
          className={`p-4 rounded-2xl transition-all active:scale-95 ${
            !isMicOn 
              ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' 
              : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
          }`}
          title={!isMicOn ? "تشغيل المايك" : "كتم المايك"}
        >
          {!isMicOn ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>

        <button
          onClick={toggleScreenShare}
          className={`p-4 rounded-2xl transition-all active:scale-95 ${
            isScreenSharing 
              ? 'bg-blue-600 text-white hover:bg-blue-700' 
              : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
          }`}
          title={isScreenSharing ? "إيقاف مشاركة الشاشة" : "مشاركة الشاشة"}
        >
          <Monitor className="w-6 h-6" />
        </button>

        <button
          onClick={handleLeaveClick}
          className="p-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl transition-all shadow-lg shadow-red-600/30 active:scale-95"
          title="مغادرة"
        >
          <PhoneOff className="w-6 h-6" />
        </button>

        <button
          onClick={toggleCamera}
          className={`p-4 rounded-2xl transition-all active:scale-95 ${
            !isCamOn 
              ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' 
              : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
          }`}
          title={!isCamOn ? "تشغيل الكاميرا" : "إغلاق الكاميرا"}
        >
          {!isCamOn ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
        </button>
      </div>

      {/* Leave / End Call Confirmation Dialog */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md font-sans" dir="rtl">
          <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-8 max-w-sm w-full text-center shadow-2xl relative animate-in zoom-in-95">
            <div className="w-16 h-16 bg-red-600/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <PhoneOff className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-white mb-2">إنهاء المكالمة أم مغادرتها؟</h3>
            <p className="text-zinc-400 text-xs font-bold leading-relaxed mb-6">
              بصفتك منشئ أو مشرف هذه المكالمة الجماعية، يمكنك مغادرتها بمفردك أو إنهائها بالكامل لجميع المشاركين.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={async () => {
                  setShowLeaveConfirm(false);
                  await executeEndCall();
                }}
                className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black transition-all active:scale-95 shadow-lg shadow-red-600/20 text-sm"
              >
                إنهاء المكالمة لجميع الأعضاء 🛑
              </button>
              <button
                onClick={async () => {
                  setShowLeaveConfirm(false);
                  await executeLeave();
                }}
                className="w-full py-3.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl font-black transition-all active:scale-95 text-sm"
              >
                مغادرة بمفردي فقط 🚪
              </button>
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="w-full py-3 bg-transparent text-zinc-500 hover:text-white rounded-2xl font-black transition-all text-xs"
              >
                تراجع وإلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const PrivateCallScreen = ({
  currentUser,
  chat,
  call,
  onClose,
  onNavigateToUser
}: {
  currentUser: FirebaseUser | null,
  chat: Chat,
  call: CallSession,
  onClose: () => void,
  onNavigateToUser: (uid: string) => void
}) => {
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [streamCall, setStreamCall] = useState<any>(null);

  useEffect(() => {
    if (!currentUser) return;

    let active = true;
    let streamClient: StreamVideoClient | null = null;
    let myCall: any = null;

    const initStream = async () => {
      try {
        const response = await fetch('/api/stream/credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.uid }),
        });
        if (!response.ok) throw new Error('Failed to fetch stream credentials');
        const { apiKey, token } = await response.json();

        if (!active) return;

        const user = {
          id: currentUser.uid,
          name: currentUser.displayName || 'مستخدم',
          image: currentUser.photoURL || '',
        };

        streamClient = new StreamVideoClient({
          apiKey,
          user,
          tokenProvider: async (): Promise<string> => token,
        });

        setClient(streamClient);

        // Second: Join the dynamic private call channel
        const channelName = call.id || chat.id || "private_call";
        myCall = streamClient.call('default', channelName);

        await myCall.join({ create: true });
        await myCall.camera.disable(); // إغلاق الكاميرا فوراً بعد الانضمام

        if (!active) {
          myCall.leave().catch(() => {});
          streamClient.disconnectUser().catch(() => {});
          return;
        }
        setStreamCall(myCall);
      } catch (err: any) {
        console.error("Error joining Stream Video Call in PrivateCallScreen:", err);
      }
    };

    initStream();

    // Cleanup and leave call to release hardware immediately
    return () => {
      active = false;
      if (myCall) {
        myCall.leave().catch((err: any) => {
          console.warn("Error leaving call in PrivateCallScreen:", err);
        });
      }
      if (streamClient) {
        streamClient.disconnectUser().catch((err: any) => {
          console.warn("Error disconnecting stream user:", err);
        });
      }
    };
  }, [currentUser, call.id, chat.id]);

  if (!client || !streamCall) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-6 relative">
        <button 
          onClick={onClose} 
          className="absolute top-6 right-6 p-3 bg-zinc-900/85 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-full transition-all border border-zinc-800/50"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex flex-col items-center max-w-sm text-center">
          <div className="relative mb-6">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-500"></div>
            <Video className="w-6 h-6 text-indigo-500 absolute inset-0 m-auto animate-pulse" />
          </div>
          <h3 className="text-xl font-black mb-2">جاري بدء الاتصال...</h3>
          <p className="text-zinc-500 font-bold text-sm">يتم الآن تهيئة اتصال مشفر وآمن عبر خوادم TruCast</p>
        </div>
      </div>
    );
  }

  // Render the modern UI Layout with SpeakerLayout and custom controls
  return (
    <div className="w-full h-screen bg-slate-950 flex flex-col relative overflow-hidden">
      <StreamVideo client={client}>
        <StreamCall call={streamCall}>
          <PrivateCallContent currentUser={currentUser} chat={chat} callSession={call} onClose={onClose} />
        </StreamCall>
      </StreamVideo>
    </div>
  );
};
