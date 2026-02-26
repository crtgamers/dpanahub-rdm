<template>
  <Teleport to="body">
    <!-- Overlay sin @click.self: modal no cerrable por clic fuera -->
    <div
      v-if="show"
      class="critical-path-modal-overlay glass-effect"
      aria-hidden="true"
    />

    <Transition name="modal-scale">
      <div
        v-if="show"
        ref="panelRef"
        class="critical-path-modal-panel glass-effect"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="descId"
      >
        <div class="critical-path-modal-header">
          <div class="critical-path-modal-icon critical-path-modal-icon-error">
            <AlertCircle :size="24" />
          </div>
          <h2
            :id="titleId"
            class="critical-path-modal-title"
          >
            {{ t('modals.criticalPath.title') }}
          </h2>
        </div>

        <div class="critical-path-modal-body">
          <p
            :id="descId"
            class="critical-path-modal-message"
          >
            {{ t('modals.criticalPath.message') }}
          </p>
        </div>

        <div class="critical-path-modal-actions">
          <button
            type="button"
            class="critical-path-modal-btn critical-path-modal-btn-secondary"
            @click="$emit('select-other')"
          >
            <Search :size="18" />
            {{ t('modals.criticalPath.selectOther') }}
          </button>
          <button
            type="button"
            class="critical-path-modal-btn critical-path-modal-btn-primary"
            @click="$emit('use-default')"
          >
            <Folder :size="18" />
            {{ t('modals.criticalPath.useDefault') }}
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { AlertCircle, Search, Folder } from 'lucide-vue-next';
import { useModalFocusTrap } from '../../composables/useModalFocusTrap';

const { t } = useI18n();

const props = defineProps<{
  show: boolean;
}>();

defineEmits<{
  (_e: 'select-other'): void;
  (_e: 'use-default'): void;
}>();

const titleId = computed(() => 'critical-path-title-' + Math.random().toString(36).slice(2, 9));
const descId = computed(() => 'critical-path-desc-' + Math.random().toString(36).slice(2, 9));

const panelRef = ref<HTMLElement | null>(null);
// No cerrable con Escape: onClose noop (solo se cierra con botones).
useModalFocusTrap(panelRef, toRef(props, 'show'), () => {});
</script>

<style scoped>
.critical-path-modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg);
  z-index: 9998;
}

.critical-path-modal-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 90vw;
  max-width: 28rem;
  z-index: 9999;
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-2xl);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.critical-path-modal-header {
  padding: var(--spacing-lg) var(--spacing-lg) 0;
  display: flex;
  align-items: center;
  gap: 0.875rem;
}

.critical-path-modal-icon {
  flex-shrink: 0;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.critical-path-modal-icon-error {
  background: var(--danger-color-alpha-22);
  color: var(--danger-color);
}

.critical-path-modal-title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.critical-path-modal-body {
  padding: 1.25rem var(--spacing-lg);
}

.critical-path-modal-message {
  margin: 0;
  font-size: var(--text-base);
  line-height: 1.55;
  color: var(--text-muted);
}

.critical-path-modal-actions {
  padding: var(--spacing-md) var(--spacing-lg) var(--spacing-lg);
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.75rem;
}

.critical-path-modal-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  border-radius: var(--radius-lg);
  font-size: var(--text-base);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.critical-path-modal-btn-secondary {
  background: var(--bg-secondary);
  color: var(--text-muted);
  border: 0.0625rem solid var(--border-color);
}

.critical-path-modal-btn-secondary:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.critical-path-modal-btn-primary {
  background: var(--primary-color);
  color: var(--text-on-primary);
}

.critical-path-modal-btn-primary:hover {
  filter: brightness(1.1);
  box-shadow: 0 0.125rem 0.5rem rgba(var(--info-color-rgb), 0.35);
}
</style>
