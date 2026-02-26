<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="db-missing-overlay glass-effect"
      @click.self="$emit('cancel')"
    />

    <Transition name="modal-scale">
      <div
        v-if="show"
        ref="modalPanel"
        class="db-missing-panel glass-effect"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="messageId"
      >
        <div class="db-missing-header">
          <div class="db-missing-icon db-missing-icon-info">
            <Database :size="24" />
          </div>
          <h2
            :id="titleId"
            class="db-missing-title"
          >
            {{ t('modals.databaseMissing.title') }}
          </h2>
        </div>

        <div class="db-missing-body">
          <p
            :id="messageId"
            class="db-missing-message"
          >
            {{ message }}
          </p>

          <div
            v-if="downloadInProgress"
            class="db-missing-progress"
            role="progressbar"
            :aria-valuenow="downloadProgressPercent"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="t('modals.databaseMissing.downloading')"
          >
            <div
              class="db-missing-progress-bar"
              :style="{ width: `${downloadProgressPercent}%` }"
            />
            <span class="db-missing-progress-text">{{
              t('modals.databaseMissing.progressPercent', {
                percent: Math.round(downloadProgressPercent),
              })
            }}</span>
          </div>

          <p
            v-if="downloadError"
            class="db-missing-error"
          >
            {{ t('modals.databaseMissing.errorLabel') }} {{ downloadError }}
          </p>
        </div>

        <div class="db-missing-actions">
          <button
            type="button"
            class="db-missing-btn db-missing-btn-secondary"
            :disabled="downloadInProgress"
            @click="$emit('open-website')"
          >
            {{ t('modals.databaseMissing.openWebsite') }}
          </button>
          <button
            type="button"
            class="db-missing-btn db-missing-btn-primary"
            :disabled="downloadInProgress"
            @click="$emit('download')"
          >
            {{ t('modals.databaseMissing.downloadDirect') }}
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { Database } from 'lucide-vue-next';
import { useModalFocusTrap } from '../../composables/useModalFocusTrap';
import type { CatalogSource } from '@/services/api/catalog';

const { t } = useI18n();

const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  source: {
    type: String as () => CatalogSource,
    required: true,
  },
  downloadInProgress: {
    type: Boolean,
    default: false,
  },
  downloadProgressPercent: {
    type: Number,
    default: 0,
  },
  downloadError: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['download', 'open-website', 'cancel']);

const message = computed(() => {
  const key =
    props.source === 'myrient'
      ? 'modals.databaseMissing.messageMyrient'
      : props.source === 'lolroms'
        ? 'modals.databaseMissing.messageLolroms'
        : props.source === 'pleasuredome'
          ? 'modals.databaseMissing.messagePleasureDome'
          : 'modals.databaseMissing.messageMyAbandonware';
  return t(key);
});

const titleId = computed(() => 'db-missing-title-' + Math.random().toString(36).slice(2, 9));
const messageId = computed(() => 'db-missing-message-' + Math.random().toString(36).slice(2, 9));

const modalPanel = ref<HTMLElement | null>(null);
useModalFocusTrap(modalPanel, toRef(props, 'show'), () => emit('cancel'));
</script>

<style scoped>
.db-missing-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg);
  z-index: 9998;
}

.db-missing-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 90vw;
  max-width: 27.5rem;
  z-index: 9999;
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-2xl);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.db-missing-header {
  padding: var(--spacing-lg) var(--spacing-lg) 0;
  display: flex;
  align-items: center;
  gap: 0.875rem;
}

.db-missing-icon {
  flex-shrink: 0;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.db-missing-icon-info {
  background: var(--info-color-alpha-25);
  color: var(--primary-color);
}

.db-missing-title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.db-missing-body {
  padding: 1.25rem var(--spacing-lg);
}

.db-missing-message {
  margin: 0 0 1rem;
  font-size: var(--text-base);
  line-height: 1.55;
  color: var(--text-muted);
  white-space: pre-line;
}

.db-missing-progress {
  position: relative;
  height: 1.5rem;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-bottom: 0.75rem;
}

.db-missing-progress-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: var(--primary-color);
  transition: width 0.2s ease;
}

.db-missing-progress-text {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-on-primary);
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
}

.db-missing-error {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--danger-color, #dc2626);
  line-height: 1.4;
}

.db-missing-actions {
  padding: var(--spacing-md) var(--spacing-lg) var(--spacing-lg);
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.db-missing-btn {
  padding: 0.625rem 1.25rem;
  border-radius: var(--radius-lg);
  font-size: var(--text-base);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.db-missing-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.db-missing-btn-secondary {
  background: var(--bg-secondary);
  color: var(--text-muted);
  border: 0.0625rem solid var(--border-color);
}

.db-missing-btn-secondary:hover:not(:disabled) {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.db-missing-btn-primary {
  background: var(--primary-color);
  color: var(--text-on-primary);
}

.db-missing-btn-primary:hover:not(:disabled) {
  filter: brightness(1.1);
  box-shadow: 0 0.125rem 0.5rem rgba(var(--info-color-rgb), 0.35);
}
</style>
