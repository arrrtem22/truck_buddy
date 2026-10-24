import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { CopilotSheet } from "@/src/components/CopilotSheet";
import { Icon } from "@/src/components/Icon";
import MapLayer from "@/src/components/MapLayer";
import type { MapLayerHandle } from "@/src/components/mapTypes";
import { PressableScale } from "@/src/components/PressableScale";
import { CaptionBubble, Toast, type ToastData } from "@/src/components/Toast";
import { TopBar } from "@/src/components/TopBar";
import { MESSAGES, MOCK_UTTERANCE } from "@/src/constants";
import { useDriverLocation } from "@/src/hooks/useDriverLocation";
import { shadow, spacing, useTheme } from "@/src/theme";
import type { ActiveRoute, Category, LatLng, Phase, Place } from "@/src/types";
import { openGoogleMaps, openWaze } from "@/src/utils/navLinks";

const MIN_THINKING_MS = 1500;
const LISTEN_WATCHDOG_MS = 20000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const loc = useDriverLocation();
  const mapRef = useRef<MapLayerHandle>(null);
  const center = useRef<LatLng>(loc.coords);

  const [topH, setTopH] = useState(140);
  const [sheetH, setSheetH] = useState(260);
  const [phase, setPhase] = useState<Phase>("ready");
  const [active, setActive] = useState<ActiveRoute | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [loadingCat, setLoadingCat] = useState<Category | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [caption, setCaption] = useState<string | null>(null);
  const [fit, setFit] = useState<{ key: string; points: LatLng[] }>({ key: "init", points: [] });

  const turn = useRef(0);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string, kind: ToastData["kind"] = "error") => {
    setToast({ id: Date.now(), text, kind });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!caption) return;
    const t = setTimeout(() => setCaption(null), 8000);
    return () => clearTimeout(t);
  }, [caption]);

  // Re-center once when the real GPS fix arrives.
  useEffect(() => {
    if (!loc.isDemo) {
      center.current = loc.coords;
      setFit({ key: "gps", points: [loc.coords] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.isDemo]);

  const speak = (text: string) => {
    Speech.stop();
    Speech.speak(text, { language: "en-US", rate: 1.0 });
  };

  const startRoute = (next: ActiveRoute, reply?: string) => {
    setActive(next);
    setPhase("navigating");
    setFit({ key: `route-${next.place.id}-${Date.now()}`, points: [loc.coords, next.place] });
    if (reply) {
      setCaption(reply);
      speak(reply);
    }
  };

  const onSelectCategory = async (c: Category) => {
    if (category === c) {
      setCategory(null);
      setPlaces([]);
      return;
    }
    setCategory(c);
    setLoadingCat(c);
    try {
      const res = await api.places(c, center.current);
      setPlaces(res.places);
      if (res.places.length === 0) showToast(MESSAGES.noPlaces);
      else if (!active) setFit({ key: `cat-${c}-${Date.now()}`, points: [loc.coords, ...res.places.slice(0, 6)] });
    } catch {
      setPlaces([]);
      showToast(MESSAGES.noPlaces);
    } finally {
      setLoadingCat(null);
    }
  };

  const clearWatchdog = () => {
    if (watchdog.current) clearTimeout(watchdog.current);
    watchdog.current = null;
  };

  const backToIdle = () => setPhase(active ? "navigating" : "ready");

  // MOCK voice turn: listening is visual only; the request text comes from MOCK_UTTERANCE.
  const submitTurn = async () => {
    clearWatchdog();
    const myTurn = ++turn.current;
    setPhase("thinking");
    const text = MOCK_UTTERANCE[category ?? "default"];
    try {
      const [res] = await Promise.all([api.agent(text, loc.coords), sleep(MIN_THINKING_MS)]);
      if (myTurn !== turn.current) return;
      if (res.status === "route_set" && res.place && res.route) {
        startRoute({ place: res.place, route: res.route }, res.reply);
      } else {
        showToast(res.message ?? MESSAGES.notUnderstood);
        if (res.reply) speak(res.reply);
        backToIdle();
      }
    } catch {
      if (myTurn !== turn.current) return;
      showToast(MESSAGES.notUnderstood);
      setPhase("ready");
      setActive(null);
    }
  };

  const onAvatarPress = () => {
    if (phase === "thinking") return;
    if (phase === "listening") {
      submitTurn();
      return;
    }
    Speech.stop();
    setCaption(null);
    setPhase("listening");
    clearWatchdog();
    watchdog.current = setTimeout(submitTurn, LISTEN_WATCHDOG_MS);
  };

  const onClose = () => {
    clearWatchdog();
    turn.current++; // discard any in-flight turn
    backToIdle();
  };

  const onEndRoute = () => {
    Speech.stop();
    setActive(null);
    setCaption(null);
    setPhase("ready");
    setFit({ key: `end-${Date.now()}`, points: [loc.coords] });
  };

  const onPlacePress = async (p: Place) => {
    try {
      const res = await api.route(loc.coords, p.id);
      startRoute(res);
    } catch {
      showToast("Couldn't build a route. Try again.");
    }
  };

  useEffect(
    () => () => {
      clearWatchdog();
      Speech.stop();
    },
    [],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.mapPlaceholder }]} testID="map-screen">
      <MapLayer
        ref={mapRef}
        driver={loc.coords}
        heading={loc.heading}
        places={places}
        active={active}
        topInset={topH}
        bottomInset={sheetH}
        fitKey={fit.key}
        fitPoints={fit.points}
        onCenterChange={(c) => (center.current = c)}
        onPlacePress={onPlacePress}
      />

      <TopBar
        topInset={insets.top}
        selected={category}
        loading={loadingCat}
        isDemo={loc.resolved && loc.isDemo}
        onSelect={onSelectCategory}
        onLayout={setTopH}
      />

      <PressableScale
        testID="recenter-button"
        accessibilityLabel="Recenter"
        onPress={() => mapRef.current?.recenter()}
        style={[styles.recenter, shadow(colors), { backgroundColor: colors.surface, bottom: sheetH + spacing.lg }]}
      >
        <Icon name="crosshairs-gps" size={24} color={colors.info} />
      </PressableScale>

      <CaptionBubble text={caption} bottom={sheetH + spacing.lg} />

      <CopilotSheet
        phase={phase}
        active={active}
        bottomInset={insets.bottom}
        onAvatarPress={onAvatarPress}
        onClose={onClose}
        onEndRoute={onEndRoute}
        onOpenGoogle={() => active && openGoogleMaps(active.place.lat, active.place.lng)}
        onOpenWaze={() => active && openWaze(active.place.lat, active.place.lng)}
        onLayout={setSheetH}
      />

      <Toast toast={toast} top={topH + spacing.sm} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  recenter: {
    position: "absolute",
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
