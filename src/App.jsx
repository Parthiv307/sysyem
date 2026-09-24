import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "./supabaseClient";
import { createStorage, subscribeToChanges } from "./storageShim";
import Auth from "./Auth";
import HunterSystem, { GlobalStyle } from "./HunterSystem";

// Resizes/compresses an image client-side and returns it as a small base64
// data URL — this gets stored directly in your existing hunter_data row, so
// there's no Supabase Storage bucket or extra policies to set up. A 256px
// JPEG at 85% quality is typically 10-40KB, which is fine to keep inline.
function resizeImageToDataUrl(file, maxSize = 256, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) { height = Math.round(height * (maxSize / width)); width = maxSize; }
        } else {
          if (height > maxSize) { width = Math.round(width * (maxSize / height)); height = maxSize; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Couldn't read that image."));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
}

export default function App() {
  // undefined = still checking, null = signed out, object = signed in
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Live sync: whenever this user's row changes on the backend (from any
  // device or tab), fire a DOM event that HunterSystem listens for to
  // refetch and re-render with the latest data.
  useEffect(() => {
    if (!session) return;
    const unsubscribe = subscribeToChanges(session.user.id, () => {
      window.dispatchEvent(new CustomEvent("hunter-storage-sync"));
    });
    return unsubscribe;
  }, [session]);

  if (session === undefined) {
    return (
      <div className="hs-root flex items-center justify-center min-h-screen">
        <GlobalStyle />
        <Loader2 className="animate-spin" style={{ color: "var(--accent)" }} size={28} />
      </div>
    );
  }

  if (!session) {
    return <Auth />;
  }

  // Every user gets their own storage instance scoped to their Supabase
  // user id — this is what makes accounts actually separate.
  window.storage = createStorage(session.user.id);

  return (
    <HunterSystem
      key={session.user.id}
      onSignOut={() => supabase.auth.signOut()}
      userEmail={session.user.email}
      onUploadAvatar={(file) => resizeImageToDataUrl(file, 256, 0.85)}
    />
  );
}
