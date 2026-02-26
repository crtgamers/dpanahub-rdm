<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="rb-overlay glass-effect"
      @click="handleClose"
    />

    <Transition name="modal-scale">
      <div
        v-if="show"
        class="rb-panel glass-effect"
        role="dialog"
        aria-modal="true"
        :aria-label="t('romsetBuilder.title')"
      >
        <!-- Header -->
        <div class="rb-header">
          <div class="rb-header__title">
            <Layers :size="20" />
            <h2>{{ t('romsetBuilder.title') }}</h2>
          </div>
          <div class="rb-header__stepper">
            <div
              v-for="step in currentStep"
              :key="step"
              class="rb-step-dot"
              :class="{
                'rb-step-dot--active': step === currentStep,
                'rb-step-dot--done': step < currentStep,
              }"
            />
          </div>
          <button
            type="button"
            class="btn-close-panel"
            :aria-label="t('romsetBuilder.btnClose')"
            @click="handleClose"
          >
            <X :size="20" />
          </button>
        </div>

        <!-- Body -->
        <div class="rb-body">
          <!-- Breadcrumb -->
          <div
            v-if="breadcrumb.length > 0"
            class="rb-breadcrumb"
          >
            <span
              v-for="(crumb, idx) in breadcrumb"
              :key="`${idx}-${crumb}`"
              class="rb-breadcrumb__item"
            >
              <ChevronRight
                v-if="idx > 0"
                :size="12"
                class="rb-breadcrumb__sep"
              />
              <span>{{ crumb }}</span>
            </span>
          </div>

          <p class="rb-step-indicator">
            {{ t('romsetBuilder.stepCurrent', { current: currentStep }) }}
            &mdash; {{ phaseLabel }}
          </p>

          <!-- Phase: Source -->
          <div
            v-if="phase === 'source'"
            class="rb-step"
          >
            <p class="rb-step__desc">{{ t('romsetBuilder.selectSource') }}</p>
            <div class="rb-source-grid">
              <button
                class="rb-source-card"
                :class="{ 'rb-source-card--selected': selectedSource === 'myrient' }"
                @click="selectSource('myrient')"
              >
                <Database :size="28" />
                <span>{{ t('romsetBuilder.sourceMyrient') }}</span>
              </button>
              <button
                class="rb-source-card"
                :class="{ 'rb-source-card--selected': selectedSource === 'lolroms' }"
                @click="selectSource('lolroms')"
              >
                <Database :size="28" />
                <span>{{ t('romsetBuilder.sourceLolroms') }}</span>
              </button>
            </div>
          </div>

          <!-- Phase: Navigate (generic, adapts to any depth) -->
          <div
            v-else-if="phase === 'navigate'"
            class="rb-step"
          >
            <p class="rb-step__desc">{{ navigationDescription }}</p>

            <div
              v-if="isLoading"
              class="rb-loading"
            >
              <Loader2
                class="rb-spinner"
                :size="24"
              />
              <span>{{ t('romsetBuilder.loading') }}</span>
            </div>

            <div
              v-else-if="loadError"
              class="rb-error"
            >
              <AlertCircle :size="20" />
              <span>{{ t('romsetBuilder.loadingError') }}: {{ loadError }}</span>
            </div>

            <template v-else>
              <div
                v-if="options.length > 8"
                class="rb-filter"
              >
                <Search :size="16" />
                <input
                  v-model="filterText"
                  type="text"
                  class="rb-filter__input"
                  :placeholder="t('romsetBuilder.searchPlaceholder')"
                />
              </div>

              <div
                v-if="filteredOptions.length === 0"
                class="rb-empty"
              >
                {{ t('romsetBuilder.noOptions') }}
              </div>

              <ul
                v-else
                class="rb-option-list"
              >
                <li
                  v-for="opt in filteredOptions"
                  :key="opt.id"
                  class="rb-option-item"
                  :class="{
                    'rb-option-item--selected': currentSelection?.id === opt.id,
                  }"
                  @click="selectOption(opt)"
                >
                  <FolderOpen
                    :size="16"
                    class="rb-option-item__icon"
                  />
                  <span class="rb-option-item__name">{{ opt.name }}</span>
                  <Check
                    v-if="currentSelection?.id === opt.id"
                    :size="16"
                    class="rb-option-item__check"
                  />
                </li>
              </ul>
            </template>
          </div>

          <!-- Phase: Summary -->
          <div
            v-else-if="phase === 'summary'"
            class="rb-step"
          >
            <p class="rb-step__desc">{{ t('romsetBuilder.summaryTitle') }}</p>

            <div class="rb-summary">
              <div class="rb-summary__row">
                <span class="rb-summary__label">{{ t('romsetBuilder.summarySource') }}</span>
                <span class="rb-summary__value">
                  {{
                    selectedSource === 'myrient'
                      ? t('romsetBuilder.sourceMyrient')
                      : t('romsetBuilder.sourceLolroms')
                  }}
                </span>
              </div>
              <div class="rb-summary__row">
                <span class="rb-summary__label">{{ t('romsetBuilder.summaryPath') }}</span>
                <span class="rb-summary__value rb-summary__value--path">
                  {{ breadcrumb.slice(1).join(' › ') }}
                </span>
              </div>

              <div class="rb-summary__divider" />

              <div class="rb-summary__row">
                <span class="rb-summary__label">{{ t('romsetBuilder.summaryFiles') }}</span>
                <span
                  v-if="isSummaryLoading"
                  class="rb-summary__value rb-summary__value--muted"
                >
                  <Loader2
                    class="rb-spinner rb-spinner--sm"
                    :size="14"
                  />
                  {{ t('romsetBuilder.summaryCalculating') }}
                </span>
                <span
                  v-else
                  class="rb-summary__value rb-summary__value--highlight"
                >
                  {{ summary?.fileCount?.toLocaleString() ?? '—' }}
                </span>
              </div>
              <div class="rb-summary__row">
                <span class="rb-summary__label">{{ t('romsetBuilder.summarySize') }}</span>
                <span
                  v-if="isSummaryLoading"
                  class="rb-summary__value rb-summary__value--muted"
                >
                  <Loader2
                    class="rb-spinner rb-spinner--sm"
                    :size="14"
                  />
                  {{ t('romsetBuilder.summaryCalculating') }}
                </span>
                <span
                  v-else
                  class="rb-summary__value rb-summary__value--highlight"
                >
                  {{ formattedSize }}
                </span>
              </div>
            </div>

            <div
              v-if="!isSummaryLoading && summary"
              class="rb-ready-msg"
            >
              <CheckCircle :size="18" />
              <span>{{ t('romsetBuilder.summaryReady') }}</span>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="rb-footer">
          <button
            v-if="phase !== 'source'"
            class="rb-btn rb-btn--secondary"
            @click="goPrev"
          >
            <ChevronLeft :size="16" />
            {{ t('romsetBuilder.btnPrevious') }}
          </button>
          <div
            v-else
            class="rb-footer__spacer"
          />

          <div class="rb-footer__right">
            <button
              class="rb-btn rb-btn--ghost"
              @click="handleClose"
            >
              {{ t('romsetBuilder.btnCancel') }}
            </button>

            <button
              v-if="phase === 'navigate'"
              class="rb-btn rb-btn--primary"
              :disabled="!canGoNext"
              @click="goNext"
            >
              {{ t('romsetBuilder.btnNext') }}
              <ChevronRight :size="16" />
            </button>

            <button
              v-if="phase === 'summary'"
              class="rb-btn rb-btn--primary"
              :disabled="isSummaryLoading || !summary"
              @click="handleAddToQueue"
            >
              <DownloadCloud :size="16" />
              {{ t('romsetBuilder.btnAddToQueue') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Layers,
  X,
  Database,
  Loader2,
  AlertCircle,
  Search,
  FolderOpen,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  DownloadCloud,
} from 'lucide-vue-next';
import { useRomsetBuilder } from '../../composables/useRomsetBuilder';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  close: [];
  'add-to-queue': [payload: { folderId: number; folderTitle: string }];
}>();

const { t } = useI18n();

const {
  phase,
  currentStep,
  selectedSource,
  navigationStack,
  currentSelection,
  targetFolder,
  breadcrumb,
  options,
  filteredOptions,
  filterText,
  isLoading,
  loadError,
  summary,
  isSummaryLoading,
  canGoNext,
  goNext,
  goPrev,
  selectSource,
  selectOption,
  reset,
} = useRomsetBuilder();

const phaseLabel = computed(() => {
  if (phase.value === 'source') return t('romsetBuilder.stepSource');
  if (phase.value === 'summary') return t('romsetBuilder.stepSummary');
  if (navigationStack.value.length === 0) {
    return selectedSource.value === 'myrient'
      ? t('romsetBuilder.stepProject')
      : t('romsetBuilder.stepCompany');
  }
  return t('romsetBuilder.stepFolder');
});

const navigationDescription = computed(() => {
  if (navigationStack.value.length === 0) {
    if (selectedSource.value === 'myrient') return t('romsetBuilder.selectProject');
    return t('romsetBuilder.selectCompanyLolroms');
  }
  return t('romsetBuilder.selectFolder');
});

const formattedSize = computed(() => {
  if (!summary.value) return '—';
  const bytes = summary.value.totalSizeBytes;
  if (bytes === 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
});

function handleAddToQueue(): void {
  const folder = targetFolder.value;
  if (!folder) return;
  const title = breadcrumb.value.slice(1).join(' › ');
  emit('add-to-queue', { folderId: folder.id, folderTitle: title || folder.name });
  reset();
  emit('close');
}

function handleClose(): void {
  reset();
  emit('close');
}

watch(
  () => props.show,
  val => {
    if (val) reset();
  }
);
</script>

<style scoped>
.rb-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg);
  z-index: 9998;
}

.rb-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(92vw, 42rem);
  min-width: min(20rem, 100vw);
  max-width: 42rem;
  max-height: min(88vh, 92dvh);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-2xl);
  overflow: hidden;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

/* Header */
.rb-header {
  padding: 1.25rem 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.rb-header__title {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  color: var(--primary-color);
  flex-shrink: 0;
}

.rb-header__title h2 {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 800;
  letter-spacing: -0.5px;
}

.rb-header__stepper {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex: 1;
  justify-content: center;
}

.rb-step-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: var(--radius-full);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  transition: all 0.3s ease;
}

.rb-step-dot--active {
  width: 1.5rem;
  background: var(--primary-color);
  border-color: var(--primary-color);
  box-shadow: 0 0 8px rgba(var(--primary-color-rgb), 0.4);
}

.rb-step-dot--done {
  background: var(--primary-color);
  border-color: var(--primary-color);
  opacity: 0.5;
}

/* Breadcrumb */
.rb-breadcrumb {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.125rem;
  font-size: var(--text-xs);
  color: var(--text-muted);
  padding: 0.375rem 0.75rem;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
}

.rb-breadcrumb__item {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.rb-breadcrumb__sep {
  opacity: 0.4;
  flex-shrink: 0;
}

/* Body */
.rb-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 0;
}

.rb-step-indicator {
  font-size: var(--text-sm);
  color: var(--text-muted);
  font-weight: 600;
  margin: 0;
}

.rb-step {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.rb-step__desc {
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--text-secondary);
  margin: 0;
}

/* Source cards */
.rb-source-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.rb-source-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem 1rem;
  background: var(--bg-secondary);
  border: 2px solid var(--border-color);
  border-radius: var(--radius-xl);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--text-base);
  font-weight: 700;
  font-family: inherit;
  transition: all 0.2s ease;
}

.rb-source-card:hover {
  background: var(--bg-hover);
  border-color: var(--primary-color);
  color: var(--text-primary);
}

.rb-source-card--selected {
  background: var(--primary-color-alpha);
  border-color: var(--primary-color);
  color: var(--primary-color);
}

/* Loading / Error / Empty */
.rb-loading {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 1rem 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.rb-spinner {
  animation: spin 1s linear infinite;
}

.rb-spinner--sm {
  display: inline-block;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.rb-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: var(--danger-color-alpha-10);
  border: 1px solid var(--danger-color-alpha-15);
  border-radius: var(--radius-md);
  color: var(--danger-color);
  font-size: var(--text-sm);
}

.rb-empty {
  padding: 2rem;
  text-align: center;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

/* Filter */
.rb-filter {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 0.5rem 0.75rem;
  color: var(--text-muted);
  transition: border-color 0.2s;
}

.rb-filter:focus-within {
  border-color: var(--primary-color);
}

.rb-filter__input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-size: var(--text-sm);
  outline: none;
  font-family: inherit;
}

/* Option list */
.rb-option-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 22rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  scrollbar-width: thin;
  scrollbar-color: var(--bg-tertiary) transparent;
}

.rb-option-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.625rem 0.75rem;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s ease;
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.rb-option-item:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.rb-option-item--selected {
  background: var(--primary-color-alpha);
  color: var(--primary-color);
}

.rb-option-item--selected:hover {
  background: var(--primary-color-alpha);
}

.rb-option-item__icon {
  flex-shrink: 0;
  opacity: 0.6;
}

.rb-option-item__name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rb-option-item__check {
  flex-shrink: 0;
  color: var(--primary-color);
}

/* Summary */
.rb-summary {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.rb-summary__row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.rb-summary__label {
  font-size: var(--text-sm);
  color: var(--text-muted);
  font-weight: 600;
  min-width: 6.5rem;
  flex-shrink: 0;
}

.rb-summary__value {
  font-size: var(--text-sm);
  color: var(--text-primary);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.rb-summary__value--path {
  word-break: break-word;
  line-height: 1.5;
}

.rb-summary__value--muted {
  color: var(--text-muted);
}

.rb-summary__value--highlight {
  color: var(--primary-color);
  font-weight: 800;
  font-size: var(--text-base);
}

.rb-summary__divider {
  height: 1px;
  background: var(--border-color);
  margin: 0.25rem 0;
}

.rb-ready-msg {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--success-color);
  padding: 0.5rem 0;
}

/* Footer */
.rb-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-shrink: 0;
}

.rb-footer__spacer {
  flex: 1;
}

.rb-footer__right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Buttons */
.rb-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
  white-space: nowrap;
}

.rb-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.rb-btn--primary {
  background: var(--primary-color);
  color: var(--text-on-primary);
  border-color: var(--primary-color);
  box-shadow: var(--shadow-sm);
}

.rb-btn--primary:hover:not(:disabled) {
  background: var(--primary-color-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.rb-btn--primary:active:not(:disabled) {
  transform: translateY(0);
}

.rb-btn--secondary {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-color: var(--border-color);
}

.rb-btn--secondary:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--primary-color);
}

.rb-btn--ghost {
  background: transparent;
  color: var(--text-muted);
  border-color: transparent;
}

.rb-btn--ghost:hover {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}
</style>
