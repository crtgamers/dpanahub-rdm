/**
 * @fileoverview Composable para el wizard Romset Builder.
 * @module useRomsetBuilder
 *
 * Navegación adaptativa: el wizard detecta automáticamente cuántos niveles
 * de profundidad tiene cada ruta. Cuando una carpeta seleccionada contiene
 * archivos descargables, se pasa directamente al resumen.
 *
 * Flujo: Source → [Navigate...N niveles] → Summary
 *
 * - Myrient: primer nivel filtra proyectos oficiales (No-Intro, Redump, etc.)
 * - LoLRoms: primer nivel muestra compañías directamente desde la raíz.
 */

import { ref, computed, watch, inject, type Ref, type ComputedRef } from 'vue';
import {
  getChildren,
  loadDatabase,
  getCurrentSource,
  getRomsetSummary,
  getDatabaseStatus,
} from '../services/api';
import type { CatalogSource } from '../services/api';

/** Clave para inyectar la función que abre el modal de base de datos no encontrada (desde App.vue). */
export const OPEN_DATABASE_MISSING_MODAL_KEY = 'openDatabaseMissingModal' as const;
export type OpenDatabaseMissingModalFn = (
  _source: CatalogSource
) => Promise<'cancelled' | 'opened-website' | 'downloaded'>;

/** Nodo del wizard (carpeta o archivo del catálogo). */
export interface WizardNode {
  id: number;
  name: string;
  type?: string;
}

/** Resumen de un romset seleccionado (cantidad de archivos y tamaño total). */
export interface RomsetSummary {
  fileCount: number;
  totalSizeBytes: number;
}

/** Fase del wizard: selección de fuente, navegación por niveles o resumen final. */
export type WizardPhase = 'source' | 'navigate' | 'summary';

const MYRIENT_PROJECTS = [
  'No-Intro',
  'Redump',
  'TOSEC',
  'TOSEC-ISO',
  'TOSEC-PIX',
  'MAME',
  'HBMAME',
  'FinalBurn Neo',
  'Total DOS Collection',
  'eXo',
];

const CHILDREN_LIMIT = 5000;

export interface UseRomsetBuilderReturn {
  phase: Ref<WizardPhase>;
  currentStep: ComputedRef<number>;

  selectedSource: Ref<CatalogSource | null>;
  navigationStack: Ref<WizardNode[]>;
  currentSelection: Ref<WizardNode | null>;
  targetFolder: Ref<WizardNode | null>;
  breadcrumb: ComputedRef<string[]>;

  options: Ref<WizardNode[]>;
  filteredOptions: ComputedRef<WizardNode[]>;
  filterText: Ref<string>;
  isLoading: Ref<boolean>;
  loadError: Ref<string | null>;

  summary: Ref<RomsetSummary | null>;
  isSummaryLoading: Ref<boolean>;

  canGoNext: ComputedRef<boolean>;
  canGoPrev: ComputedRef<boolean>;

  goNext: () => Promise<void>;
  goPrev: () => void;
  selectSource: (_source: CatalogSource) => Promise<void>;
  selectOption: (_node: WizardNode) => void;

  reset: () => void;
}

/**
 * Composable del wizard Romset Builder: flujo Source → Navigate → Summary con navegación adaptativa.
 * @returns UseRomsetBuilderReturn (phase, selectedSource, navigationStack, options, goNext/goPrev, selectSource/selectOption, reset, summary, etc.).
 */
export function useRomsetBuilder(): UseRomsetBuilderReturn {
  const phase = ref<WizardPhase>('source');

  const selectedSource = ref<CatalogSource | null>(null);
  /** Ruta de carpetas por las que el usuario ha navegado. */
  const navigationStack = ref<WizardNode[]>([]);
  /** Carpeta actualmente resaltada en la lista (aún no confirmada). */
  const currentSelection = ref<WizardNode | null>(null);
  /** Carpeta elegida para descargar (contiene archivos). Se establece al entrar en el resumen. */
  const targetFolder = ref<WizardNode | null>(null);

  const options = ref<WizardNode[]>([]);
  const filterText = ref('');
  const isLoading = ref(false);
  const loadError = ref<string | null>(null);

  const summary = ref<RomsetSummary | null>(null);
  const isSummaryLoading = ref(false);

  const currentStep = computed(() => {
    if (phase.value === 'source') return 1;
    if (phase.value === 'navigate') return 2 + navigationStack.value.length;
    return 3 + navigationStack.value.length; // summary
  });

  const breadcrumb = computed(() => {
    const parts: string[] = [];
    if (selectedSource.value) {
      parts.push(selectedSource.value === 'myrient' ? 'Myrient' : 'LoLROMs');
    }
    for (const node of navigationStack.value) {
      parts.push(node.name);
    }
    if (phase.value === 'summary' && targetFolder.value) {
      parts.push(targetFolder.value.name);
    }
    return parts;
  });

  const filteredOptions = computed(() => {
    const q = filterText.value.trim().toLowerCase();
    if (!q) return options.value;
    return options.value.filter(o => o.name.toLowerCase().includes(q));
  });

  const canGoNext = computed(() => {
    if (phase.value === 'source') return selectedSource.value !== null;
    if (phase.value === 'navigate') return currentSelection.value !== null;
    return false;
  });

  const canGoPrev = computed(() => phase.value !== 'source');

  watch(phase, () => {
    filterText.value = '';
  });
  watch(
    navigationStack,
    () => {
      filterText.value = '';
    },
    { deep: true }
  );

  // ─── Data loading ───

  async function loadChildrenForNode(parentId: number): Promise<void> {
    isLoading.value = true;
    loadError.value = null;
    options.value = [];

    try {
      const res = await getChildren(parentId, { limit: CHILDREN_LIMIT, offset: 0 });
      if (!res.success) {
        loadError.value = res.error ?? 'Error desconocido';
        return;
      }
      const data = (res.data ?? []) as Array<{
        id: number;
        name?: string;
        title?: string;
        type?: string;
      }>;
      options.value = data
        .filter(n => {
          const t = (n.type ?? '').toLowerCase();
          return t === 'folder' || t === 'directory';
        })
        .map(n => ({
          id: n.id,
          name: (n.title ?? n.name ?? '').replace(/\/$/, ''),
          type: n.type,
        }));
    } catch (err) {
      loadError.value = (err as Error).message;
    } finally {
      isLoading.value = false;
    }
  }

  async function loadMyrientProjects(): Promise<void> {
    isLoading.value = true;
    loadError.value = null;
    options.value = [];

    try {
      const res = await getChildren(1, { limit: CHILDREN_LIMIT, offset: 0 });
      if (!res.success) {
        loadError.value = res.error ?? 'Error desconocido';
        return;
      }
      const data = (res.data ?? []) as Array<{
        id: number;
        name?: string;
        title?: string;
        type?: string;
      }>;
      const lowerProjects = MYRIENT_PROJECTS.map(p => p.toLowerCase());

      options.value = data
        .filter(n => {
          const t = (n.type ?? '').toLowerCase();
          if (t !== 'folder' && t !== 'directory') return false;
          const nodeName = (n.title ?? n.name ?? '').replace(/\/$/, '').toLowerCase();
          return lowerProjects.some(p => nodeName === p || nodeName.startsWith(p + ' '));
        })
        .map(n => ({
          id: n.id,
          name: (n.title ?? n.name ?? '').replace(/\/$/, ''),
          type: n.type,
        }));
    } catch (err) {
      loadError.value = (err as Error).message;
    } finally {
      isLoading.value = false;
    }
  }

  async function reloadCurrentLevel(): Promise<void> {
    const stack = navigationStack.value;
    if (stack.length === 0) {
      if (selectedSource.value === 'myrient') {
        await loadMyrientProjects();
      } else {
        await loadChildrenForNode(1);
      }
    } else {
      await loadChildrenForNode(stack[stack.length - 1].id);
    }
  }

  async function ensureSourceLoaded(source: CatalogSource): Promise<boolean> {
    const currentRes = await getCurrentSource();
    const current = currentRes.success ? (currentRes.data as CatalogSource | null) : null;
    if (current === source) return true;
    const loadRes = await loadDatabase(source);
    return loadRes.success;
  }

  // ─── Actions ───

  const openDatabaseMissingModal = inject<OpenDatabaseMissingModalFn | null>(
    OPEN_DATABASE_MISSING_MODAL_KEY,
    null
  );

  async function selectSource(source: CatalogSource): Promise<void> {
    selectedSource.value = source;
    navigationStack.value = [];
    currentSelection.value = null;
    targetFolder.value = null;
    summary.value = null;

    isLoading.value = true;
    loadError.value = null;

    const statusResult = await getDatabaseStatus(source);
    const status = statusResult.success && statusResult.data != null ? statusResult.data : 'none';

    if (status === 'none' && openDatabaseMissingModal) {
      const result = await openDatabaseMissingModal(source);
      if (result !== 'downloaded') {
        selectedSource.value = null;
        isLoading.value = false;
        return;
      }
      // Usuario descargó la base de datos; continuar cargando y pasando a navegar.
    }

    const ok = await ensureSourceLoaded(source);
    if (!ok) {
      loadError.value = 'Error loading database';
      isLoading.value = false;
      return;
    }

    phase.value = 'navigate';

    if (source === 'myrient') {
      await loadMyrientProjects();
    } else {
      await loadChildrenForNode(1);
    }
  }

  function selectOption(node: WizardNode): void {
    currentSelection.value = node;
  }

  async function calculateSummary(): Promise<void> {
    const targetId = targetFolder.value?.id;
    if (!targetId) {
      summary.value = null;
      return;
    }
    isSummaryLoading.value = true;
    try {
      const res = await getRomsetSummary([targetId]);
      if (res.success && res.data) {
        summary.value = {
          fileCount: res.data.fileCount,
          totalSizeBytes: res.data.totalSizeBytes,
        };
      } else {
        summary.value = null;
      }
    } catch {
      summary.value = null;
    } finally {
      isSummaryLoading.value = false;
    }
  }

  /**
   * Avanza al siguiente nivel. Carga los hijos de la carpeta seleccionada:
   * - Si contiene archivos → pasa al resumen (es el último nivel).
   * - Si solo tiene subcarpetas → navega más profundo.
   */
  async function goNext(): Promise<void> {
    if (!canGoNext.value) return;
    if (phase.value !== 'navigate' || !currentSelection.value) return;

    const selected = currentSelection.value;
    isLoading.value = true;
    loadError.value = null;

    try {
      const res = await getChildren(selected.id, { limit: CHILDREN_LIMIT, offset: 0 });
      if (!res.success) {
        loadError.value = res.error ?? 'Error desconocido';
        isLoading.value = false;
        return;
      }

      const data = (res.data ?? []) as Array<{
        id: number;
        name?: string;
        title?: string;
        type?: string;
      }>;

      const hasFiles = data.some(n => (n.type ?? '').toLowerCase() === 'file');

      if (hasFiles) {
        targetFolder.value = selected;
        phase.value = 'summary';
        options.value = [];
        currentSelection.value = null;
        isLoading.value = false;
        await calculateSummary();
      } else {
        navigationStack.value = [...navigationStack.value, selected];
        currentSelection.value = null;
        options.value = data
          .filter(n => {
            const t = (n.type ?? '').toLowerCase();
            return t === 'folder' || t === 'directory';
          })
          .map(n => ({
            id: n.id,
            name: (n.title ?? n.name ?? '').replace(/\/$/, ''),
            type: n.type,
          }));
        isLoading.value = false;
      }
    } catch (err) {
      loadError.value = (err as Error).message;
      isLoading.value = false;
    }
  }

  function goPrev(): void {
    if (!canGoPrev.value) return;

    if (phase.value === 'summary') {
      phase.value = 'navigate';
      targetFolder.value = null;
      summary.value = null;
      currentSelection.value = null;
      void reloadCurrentLevel();
    } else if (phase.value === 'navigate') {
      if (navigationStack.value.length === 0) {
        phase.value = 'source';
        selectedSource.value = null;
        options.value = [];
        currentSelection.value = null;
      } else {
        const stack = [...navigationStack.value];
        stack.pop();
        navigationStack.value = stack;
        currentSelection.value = null;
        void reloadCurrentLevel();
      }
    }
  }

  function reset(): void {
    phase.value = 'source';
    selectedSource.value = null;
    navigationStack.value = [];
    currentSelection.value = null;
    targetFolder.value = null;
    options.value = [];
    filterText.value = '';
    isLoading.value = false;
    loadError.value = null;
    summary.value = null;
    isSummaryLoading.value = false;
  }

  return {
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
    canGoPrev,

    goNext,
    goPrev,
    selectSource,
    selectOption,

    reset,
  };
}
