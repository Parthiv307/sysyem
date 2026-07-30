import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "./supabaseClient";
import { createStorage, subscribeToChanges } from "./storageShim";
import Auth from "./Auth";
import HunterSystem, { GlobalStyle } from "./HunterSystem";

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
    />
  );
}
