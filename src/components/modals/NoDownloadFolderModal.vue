<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="download-folder-modal-overlay glass-effect"
      @click.self="$emit('cancel')"
    />

    <Transition name="modal-scale">
      <div
        v-if="show"
        ref="panelRef"
        class="download-folder-modal-panel glass-effect"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="descId"
      >
        <div class="download-folder-modal-header">
          <div class="download-folder-modal-icon download-folder-modal-icon-info">
            <FolderOpen :size="24" />
          </div>
          <h2
            :id="titleId"
            class="download-folder-modal-title"
          >
            {{ t('modals.noDownloadFolder.title') }}
          </h2>
        </div>

        <div class="download-folder-modal-body">
          <p
            :id="descId"
            class="download-folder-modal-message"
          >
            {{ t('modals.noDownloadFolder.message') }}
          </p>
          <p
            v-if="defaultPath"
            class="download-folder-modal-default-path"
          >
            {{ t('modals.noDownloadFolder.defaultPathLabel') }}
            <code class="download-folder-modal-path-code">{{ defaultPath }}</code>
          </p>
        </div>

        <div class="download-folder-modal-actions">
          <button
            type="button"
            class="download-folder-modal-btn download-folder-modal-btn-secondary"
            @click="$emit('select-location')"
          >
            <Search :size="18" />
            {{ t('modals.noDownloadFolder.selectLocation') }}
          </button>
          <button
            type="button"
            class="download-folder-modal-btn download-folder-modal-btn-primary"
            @click="$emit('use-default')"
          >
            <Folder :size="18" />
            {{ t('modals.noDownloadFolder.useDefault') }}
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { FolderOpen, Search, Folder } from 'lucide-vue-next';
import { useModalFocusTrap } from '../../composables/useModalFocusTrap';

const { t } = useI18n();

const props = defineProps<{
  show: boolean;
  defaultPath?: string;
}>();

const emit = defineEmits<{
  (_e: 'cancel'): void;
  (_e: 'select-location'): void;
  (_e: 'use-default'): void;
}>();

const titleId = computed(
  () => 'no-download-folder-title-' + Math.random().toString(36).slice(2, 9)
);
const descId = computed(() => 'no-download-folder-desc-' + Math.random().toString(36).slice(2, 9));

const panelRef = ref<HTMLElement | null>(null);
useModalFocusTrap(panelRef, toRef(props, 'show'), () => emit('cancel'));
</script>

<style scoped>
.download-folder-modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg);
  z-index: 9998;
}

.download-folder-modal-panel {
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

.download-folder-modal-header {
  padding: var(--spacing-lg) var(--spacing-lg) 0;
  display: flex;
  align-items: center;
  gap: 0.875rem;
}

.download-folder-modal-icon {
  flex-shrink: 0;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.download-folder-modal-icon-info {
  background: var(--info-color-alpha-25);
  color: var(--primary-color);
}

.download-folder-modal-title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.download-folder-modal-body {
  padding: 1.25rem var(--spacing-lg);
}

.download-folder-modal-message {
  margin: 0 0 0.75rem;
  font-size: var(--text-base);
  line-height: 1.55;
  color: var(--text-muted);
}

.download-folder-modal-default-path {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.download-folder-modal-path-code {
  display: block;
  margin-top: 0.25rem;
  padding: 0.5rem 0.75rem;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  word-break: break-all;
  color: var(--text-primary);
}

.download-folder-modal-actions {
  padding: var(--spacing-md) var(--spacing-lg) var(--spacing-lg);
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.75rem;
}

.download-folder-modal-btn {
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

.download-folder-modal-btn-secondary {
  background: var(--bg-secondary);
  color: var(--text-muted);
  border: 0.0625rem solid var(--border-color);
}

.download-folder-modal-btn-secondary:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.download-folder-modal-btn-primary {
  background: var(--primary-color);
  color: var(--text-on-primary);
}

.download-folder-modal-btn-primary:hover {
  filter: brightness(1.1);
  box-shadow: 0 0.125rem 0.5rem rgba(var(--info-color-rgb), 0.35);
}
</style>
