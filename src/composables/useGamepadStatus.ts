import { onMounted, onUnmounted, ref } from "vue";

export function useGamepadStatus() {
  const connected = ref(false);
  const gamepadName = ref<string | null>(null);

  function refreshFromNavigator() {
    const pad = navigator.getGamepads().find((p) => p !== null);
    connected.value = pad !== undefined;
    gamepadName.value = pad?.id ?? null;
  }

  function onConnected(event: GamepadEvent) {
    connected.value = true;
    gamepadName.value = event.gamepad.id;
  }

  function onDisconnected() {
    refreshFromNavigator();
  }

  onMounted(() => {
    refreshFromNavigator();
    window.addEventListener("gamepadconnected", onConnected);
    window.addEventListener("gamepaddisconnected", onDisconnected);
  });

  onUnmounted(() => {
    window.removeEventListener("gamepadconnected", onConnected);
    window.removeEventListener("gamepaddisconnected", onDisconnected);
  });

  return { connected, gamepadName };
}
