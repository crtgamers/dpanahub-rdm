/**
 * Composable para el estado de selección de archivos en explorar y en resultados de búsqueda.
 *
 * Expone: selectedFiles (IDs en vista explorar), selectedSearchFiles (IDs en búsqueda),
 * toggleFileSelection, toggleSelectAllFiles, toggleSearchFileSelection, clearSelections,
 * isAllFilesSelected, y respeta un límite máximo de selección (MAX_SELECTION_FILES).
 * La orquestación de descarga (modales, useDownloads) permanece en App.vue.
 *
 * @module useFileSelection
 */

import { ref, computed, type ComputedRef } from 'vue';

const MAX_SELECTION_FILES = 1000;

interface FileWithId {
  id: number;
  [key: string]: unknown;
}

interface UseFileSelectionOptions {
  /** Lista de archivos mostrados (filtrados o todos) en vista explorar. */
  displayedFiles: ComputedRef<FileWithId[]>;
  /** Función para mostrar toast (usada al alcanzar límite de selección). */
  showToast: (_opts: { title: string; message: string; type: string; duration: number }) => void;
  /** Función de traducción i18n. */
  t: (_key: string) => string;
}

/**
 * Composable de selección de archivos en vista explorar y en resultados de búsqueda.
 *
 * @param options - displayedFiles (computed de archivos visibles), showToast (para límite de selección) y t (i18n).
 * @returns Objeto con selectedFiles, selectedSearchFiles, MAX_SELECTION_FILES, isAllFilesSelected,
 *   toggleFileSelection, toggleSelectAllFiles, toggleSearchFileSelection, createToggleSelectAllSearch.
 */
export function useFileSelection(options: UseFileSelectionOptions) {
  const { displayedFiles, showToast, t } = options;

  // --- Selección en vista explorar ---

  const selectedFiles = ref<number[]>([]);

  const toggleFileSelection = (fileId: number) => {
    const index = selectedFiles.value.indexOf(fileId);
    if (index >= 0) {
      selectedFiles.value.splice(index, 1);
    } else {
      selectedFiles.value.push(fileId);
    }
  };

  const isAllFilesSelected = computed(() => {
    const total = displayedFiles.value.length;
    const selected = selectedFiles.value.length;
    return (
      total > 0 &&
      (selected === total || (total > MAX_SELECTION_FILES && selected === MAX_SELECTION_FILES))
    );
  });

  const toggleSelectAllFiles = () => {
    const totalFiles = displayedFiles.value.length;

    if (isAllFilesSelected.value) {
      selectedFiles.value = [];
      return;
    }

    if (totalFiles > MAX_SELECTION_FILES) {
      selectedFiles.value = displayedFiles.value.slice(0, MAX_SELECTION_FILES).map(f => f.id);
      showToast({
        title: t('downloads.selectionLimitReached'),
        message: t('downloads.selectionLimitHint'),
        type: 'warning',
        duration: 7000,
      });
    } else {
      selectedFiles.value = displayedFiles.value.map(f => f.id);
    }
  };

  // --- Selección en resultados de búsqueda ---

  const selectedSearchFiles = ref<number[]>([]);

  const toggleSearchFileSelection = (fileId: number) => {
    const index = selectedSearchFiles.value.indexOf(fileId);
    if (index >= 0) {
      selectedSearchFiles.value.splice(index, 1);
    } else {
      selectedSearchFiles.value.push(fileId);
    }
  };

  const createToggleSelectAllSearch = (filteredSearchFiles: ComputedRef<FileWithId[]>) => () => {
    if (selectedSearchFiles.value.length === filteredSearchFiles.value.length) {
      selectedSearchFiles.value = [];
    } else {
      selectedSearchFiles.value = filteredSearchFiles.value.map(f => f.id);
    }
  };

  return {
    // State
    selectedFiles,
    selectedSearchFiles,
    MAX_SELECTION_FILES,
    // Computed
    isAllFilesSelected,
    // Methods
    toggleFileSelection,
    toggleSelectAllFiles,
    toggleSearchFileSelection,
    createToggleSelectAllSearch,
  };
}
