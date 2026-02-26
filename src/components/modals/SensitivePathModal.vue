<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="sensitive-path-modal-overlay glass-effect"
      @click.self="$emit('cancel')"
    />

    <Transition name="modal-scale">
      <div
        v-if="show"
        ref="panelRef"
        class="sensitive-path-modal-panel glass-effect"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="descId"
      >
        <div class="sensitive-path-modal-header">
          <div class="sensitive-path-modal-icon sensitive-path-modal-icon-warning">
            <AlertTriangle :size="24" />
          </div>
          <h2
            :id="titleId"
            class="sensitive-path-modal-title"
          >
            {{ t('modals.sensitivePath.title') }}
          </h2>
        </div>

        <div class="sensitive-path-modal-body">
          <p
            :id="descId"
            class="sensitive-path-modal-message"
          >
            {{ t('modals.sensitivePath.message') }}
          </p>
        </div>

        <div class="sensitive-path-modal-actions">
          <button
            type="button"
            class="sensitive-path-modal-btn sensitive-path-modal-btn-cancel"
            @click="$emit('cancel')"
          >
            {{ t('modals.sensitivePath.cancel') }}
          </button>
          <button
            type="button"
            class="sensitive-path-modal-btn sensitive-path-modal-btn-continue"
            @click="$emit('continue')"
          >
            {{ t('modals.sensitivePath.continue') }}
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { AlertTriangle } from 'lucide-vue-next';
import { useModalFocusTrap } from '../../composables/useModalFocusTrap';

const { t } = useI18n();

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (_e: 'cancel'): void;
  (_e: 'continue'): void;
}>();

const titleId = computed(() => 'sensitive-path-title-' + Math.random().toString(36).slice(2, 9));
const descId = computed(() => 'sensitive-path-desc-' + Math.random().toString(36).slice(2, 9));

const panelRef = ref<HTMLElement | null>(null);
useModalFocusTrap(panelRef, toRef(props, 'show'), () => emit('cancel'));
</script>

<style scoped>
.sensitive-path-modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg);
  z-index: 9998;
}

.sensitive-path-modal-panel {
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

.sensitive-path-modal-header {
  padding: var(--spacing-lg) var(--spacing-lg) 0;
  display: flex;
  align-items: center;
  gap: 0.875rem;
}

.sensitive-path-modal-icon {
  flex-shrink: 0;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sensitive-path-modal-icon-warning {
  background: var(--warning-color-alpha-22);
  color: var(--warning-color);
}

.sensitive-path-modal-title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.sensitive-path-modal-body {
  padding: 1.25rem var(--spacing-lg);
}

.sensitive-path-modal-message {
  margin: 0;
  font-size: var(--text-base);
  line-height: 1.55;
  color: var(--text-muted);
}

.sensitive-path-modal-actions {
  padding: var(--spacing-md) var(--spacing-lg) var(--spacing-lg);
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.sensitive-path-modal-btn {
  padding: 0.625rem 1.25rem;
  border-radius: var(--radius-lg);
  font-size: var(--text-base);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.sensitive-path-modal-btn-cancel {
  background: var(--bg-secondary);
  color: var(--text-muted);
  border: 0.0625rem solid var(--border-color);
}

.sensitive-path-modal-btn-cancel:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.sensitive-path-modal-btn-continue {
  background: var(--primary-color);
  color: var(--text-on-primary);
}

.sensitive-path-modal-btn-continue:hover {
  filter: brightness(1.1);
  box-shadow: 0 0.125rem 0.5rem rgba(var(--info-color-rgb), 0.35);
}
</style>
