/**
 * @fileoverview Composable unificado para modales: trampa de foco + cierre con Escape.
 * @module useModalFocusTrap
 *
 * Encapsula el patrón repetido en modales: activar useFocusTrap al abrir, desactivar al cerrar,
 * y escuchar Escape para llamar a onClose. Usar en lugar de useFocusTrap + watch + onMounted/onUnmounted manuales.
 */
import { watch, nextTick, onMounted, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import { useFocusTrap, type UseFocusTrapOptions } from './useFocusTrap';

/**
 * Configura trampa de foco y cierre con Escape para un modal/panel. Activa useFocusTrap cuando isOpen es true y escucha Escape para onClose.
 *
 * @param panelRef - Ref del elemento del modal (panel con role="dialog" o contenedor).
 * @param isOpen - Ref que indica si el modal está visible.
 * @param onClose - Callback al pulsar Escape (p. ej. emit('close')).
 * @param options - Opciones para useFocusTrap (p. ej. initialFocusSelector).
 */
export function useModalFocusTrap(
  panelRef: Ref<HTMLElement | null>,
  isOpen: Ref<boolean>,
  onClose: () => void,
  options?: UseFocusTrapOptions
): void {
  const { activate: activateFocusTrap } = useFocusTrap(panelRef, options);
  let focusTrapCleanup: (() => void) | undefined;

  function handleEsc(e: KeyboardEvent) {
    if (e.key === 'Escape' && isOpen.value) onClose();
  }

  watch(
    isOpen,
    val => {
      if (val) {
        document.addEventListener('keydown', handleEsc);
        nextTick(() => {
          focusTrapCleanup = activateFocusTrap();
        });
      } else {
        document.removeEventListener('keydown', handleEsc);
        focusTrapCleanup?.();
        focusTrapCleanup = undefined;
      }
    },
    { immediate: true }
  );

  onMounted(() => {
    if (isOpen.value) document.addEventListener('keydown', handleEsc);
  });

  onUnmounted(() => {
    document.removeEventListener('keydown', handleEsc);
    focusTrapCleanup?.();
  });
}
