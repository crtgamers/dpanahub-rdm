/**
 * @fileoverview Composable para gestión de favoritos (carpetas)
 * @module useFavorites
 */

import { ref, computed } from 'vue';
import type { Ref, ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { readConfigFile, writeConfigFile } from '../services/api';
import type { CatalogSource } from '../services/api';
import logger from '../utils/logger';
import { useToasts } from './useToasts';

export interface FavoriteNode {
  id: number;
  title: string;
  type?: string;
  /** Fuente del favorito. Opcional; por defecto se asume myrient. */
  source?: CatalogSource;
}

const favorites = ref<FavoriteNode[]>([]);
const showingFavorites = ref(false);

/**
 * Composable de favoritos (carpetas): lista persistida en favorites.json, añadir/quitar y panel de favoritos.
 *
 * @returns Objeto con refs, computados y métodos de gestión de favoritos.
 */
export function useFavorites(): {
  favorites: Ref<FavoriteNode[]>;
  showingFavorites: Ref<boolean>;
  favoriteFolders: ComputedRef<FavoriteNode[]>;
  favoriteIds: ComputedRef<Set<number>>;
  getFavoriteIdsForSource: (_source: CatalogSource | null) => Set<number>;
  loadFavorites: () => Promise<void>;
  saveFavorites: () => Promise<void>;
  isFavorite: (_nodeId: number) => boolean;
  toggleFavorite: (
    _node: FavoriteNode | { id: number; title?: string; type?: string; source?: CatalogSource },
    _currentSource?: CatalogSource | null
  ) => void;
  addFavorite: (_node: FavoriteNode | { id: number; title?: string; type?: string }) => void;
  removeFavorite: (_nodeId: number) => void;
  clearFavorites: () => void;
  toggleFavoritesPanel: () => void;
} {
  const favoriteFolders = computed(() => {
    return favorites.value.filter(f => f.type === 'folder');
  });

  const favoriteIds = computed(() => {
    return new Set(favorites.value.map(f => f.id));
  });

  /** IDs de favoritos para una fuente dada (para mostrar estrellas en la vista actual). */
  const getFavoriteIdsForSource = (source: CatalogSource | null): Set<number> => {
    if (!source) return new Set();
    return new Set(favorites.value.filter(f => (f.source ?? 'myrient') === source).map(f => f.id));
  };

  const loadFavorites = async (): Promise<void> => {
    try {
      const result = await readConfigFile('favorites.json');
      if (result.success && result.data) {
        favorites.value = Array.isArray(result.data) ? (result.data as FavoriteNode[]) : [];
      } else {
        favorites.value = [];
      }
    } catch (error) {
      logger.child('Favorites').error('Error cargando favoritos', error);
      favorites.value = [];
    }
  };

  const saveFavorites = async (): Promise<void> => {
    try {
      const plain = JSON.parse(JSON.stringify(favorites.value));
      await writeConfigFile('favorites.json', plain);
    } catch (error) {
      logger.child('Favorites').error('Error guardando favoritos', error);
      const { t } = useI18n();
      const { showToast } = useToasts();
      showToast({ title: t('errors.saveFavorites'), type: 'error' });
    }
  };

  const isFavorite = (nodeId: number): boolean => {
    return favoriteIds.value.has(nodeId);
  };

  const toggleFavorite = (
    node: FavoriteNode | { id: number; title?: string; type?: string; source?: CatalogSource },
    currentSource?: CatalogSource | null
  ): void => {
    if (!node?.id) {
      logger.child('Favorites').warn('Nodo inválido al intentar marcar como favorito', node);
      return;
    }

    const source = (node as { source?: CatalogSource }).source ?? currentSource ?? 'myrient';
    const index = favorites.value.findIndex(
      f => f.id === node.id && (f.source ?? 'myrient') === source
    );

    if (index >= 0) {
      favorites.value.splice(index, 1);
      logger.child('Favorites').info('Quitado de favoritos', {
        id: node.id,
        title: node.title,
        source,
      });
    } else {
      favorites.value.push({
        id: node.id,
        title: node.title ?? '',
        type: node.type ?? 'folder',
        source,
      });
      logger.child('Favorites').info('Añadido a favoritos', {
        id: node.id,
        title: node.title,
        source,
      });
    }

    void saveFavorites();
  };

  const addFavorite = (
    node: FavoriteNode | { id: number; title?: string; type?: string }
  ): void => {
    if (!isFavorite(node.id)) {
      toggleFavorite(node);
    }
  };

  const removeFavorite = (nodeId: number): void => {
    const index = favorites.value.findIndex(f => f.id === nodeId);
    if (index >= 0) {
      favorites.value.splice(index, 1);
      void saveFavorites();
    }
  };

  const clearFavorites = (): void => {
    favorites.value = [];
    void saveFavorites();
  };

  const toggleFavoritesPanel = (): void => {
    showingFavorites.value = !showingFavorites.value;
  };

  return {
    favorites,
    showingFavorites,
    favoriteFolders,
    favoriteIds,
    getFavoriteIdsForSource,
    loadFavorites,
    saveFavorites,
    isFavorite,
    toggleFavorite,
    addFavorite,
    removeFavorite,
    clearFavorites,
    toggleFavoritesPanel,
  };
}

export default useFavorites;
