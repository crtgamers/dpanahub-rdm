<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="queue-limit-overlay glass-effect"
      @click.self="$emit('cancel')"
    />

    <Transition name="modal-scale">
      <div
        v-if="show"
        ref="panelRef"
        class="queue-limit-panel glass-effect"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="messageId"
      >
        <div class="queue-limit-header">
          <div class="queue-limit-icon queue-limit-icon-warning">
            <AlertTriangle :size="24" />
          </div>
          <h2
            :id="titleId"
            class="queue-limit-title"
          >
            {{ t('modals.queueLimitWarning.title') }}
          </h2>
        </div>

        <div class="queue-limit-body">
          <p
            :id="messageId"
            class="queue-limit-message"
          >
            {{ t('modals.queueLimitWarning.message') }}
          </p>
        </div>

        <div class="queue-limit-actions">
          <button
            type="button"
            class="queue-limit-btn queue-limit-btn-cancel"
            @click="$emit('cancel')"
          >
            {{ t('modals.queueLimitWarning.cancel') }}
          </button>
          <button
            type="button"
            class="queue-limit-btn queue-limit-btn-secondary"
            @click="$emit('add-anyway')"
          >
            {{ t('modals.queueLimitWarning.addAnyway') }}
          </button>
          <button
            type="button"
            class="queue-limit-btn queue-limit-btn-primary"
            @click="$emit('clear-completed-and-add')"
          >
            {{ t('modals.queueLimitWarning.clearCompletedAndAdd') }}
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
import type { Ref } from 'vue';

const { t } = useI18n();

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (_e: 'clear-completed-and-add'): void;
  (_e: 'add-anyway'): void;
  (_e: 'cancel'): void;
}>();

const titleId = computed(() => 'queue-limit-title-' + Math.random().toString(36).slice(2, 9));
const messageId = computed(() => 'queue-limit-msg-' + Math.random().toString(36).slice(2, 9));

const panelRef: Ref<HTMLElement | null> = ref(null);
useModalFocusTrap(panelRef, toRef(props, 'show'), () => emit('cancel'));
</script>

<style scoped>
.queue-limit-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg);
  z-index: 9998;
}

.queue-limit-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 90vw;
  max-width: 28.75rem;
  z-index: 9999;
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-2xl);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.queue-limit-header {
  padding: var(--spacing-lg) var(--spacing-lg) 0;
  display: flex;
  align-items: center;
  gap: 0.875rem;
}

.queue-limit-icon {
  flex-shrink: 0;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.queue-limit-icon-warning {
  background: var(--warning-bg, rgba(245, 158, 11, 0.15));
  color: var(--warning-color, #f59e0b);
}

.queue-limit-title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.queue-limit-body {
  padding: 1.25rem var(--spacing-lg);
}

.queue-limit-message {
  margin: 0;
  font-size: var(--text-base);
  line-height: 1.55;
  color: var(--text-muted);
}

.queue-limit-actions {
  padding: var(--spacing-md) var(--spacing-lg) var(--spacing-lg);
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.625rem;
}

.queue-limit-btn {
  padding: 0.625rem 1.125rem;
  border-radius: var(--radius-lg);
  font-size: var(--text-base);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.queue-limit-btn-cancel {
  background: transparent;
  color: var(--text-muted);
  border: 0.0625rem solid var(--border-color);
}

.queue-limit-btn-cancel:hover {
  background: var(--bg-tertiary, rgba(255, 255, 255, 0.06));
  color: var(--text-primary);
}

.queue-limit-btn-secondary {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 0.0625rem solid var(--border-color);
}

.queue-limit-btn-secondary:hover {
  background: var(--bg-tertiary, rgba(255, 255, 255, 0.08));
}

.queue-limit-btn-primary {
  background: var(--primary-color);
  color: var(--text-on-primary);
}

.queue-limit-btn-primary:hover {
  filter: brightness(1.1);
  box-shadow: 0 0.125rem 0.5rem var(--primary-color-alpha);
}
</style>
