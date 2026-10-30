import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Briefcase, Loader2, Trash2, ChevronRight, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/Modal';
import { MARKETS, getDateLocale, type Market } from '@/config';
import {
  getPortfolios,
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
  type Portfolio,
} from '@/services/portfolioService';

export function MyPortfolios() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [portfolioToEdit, setPortfolioToEdit] = useState<Portfolio | null>(null);
  const [portfolioToDelete, setPortfolioToDelete] = useState<Portfolio | null>(null);
  const [newPortfolioName, setNewPortfolioName] = useState('');
  const [newPortfolioMarket, setNewPortfolioMarket] = useState<Market>('BIST');
  const [editPortfolioName, setEditPortfolioName] = useState('');
  const [createError, setCreateError] = useState('');
  const [editError, setEditError] = useState('');

  // Fetch portfolios
  const {
    data: portfolios = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['portfolios'],
    queryFn: getPortfolios,
  });

  // Create portfolio mutation
  const createMutation = useMutation({
    mutationFn: createPortfolio,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      setIsCreateModalOpen(false);
      setNewPortfolioName('');
      setNewPortfolioMarket('BIST');
      setCreateError('');
    },
    onError: (error: Error) => {
      setCreateError(error.message);
    },
  });

  // Delete portfolio mutation
  const deleteMutation = useMutation({
    mutationFn: deletePortfolio,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      setIsDeleteModalOpen(false);
      setPortfolioToDelete(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: updatePortfolio,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      setIsEditModalOpen(false);
      setPortfolioToEdit(null);
      setEditPortfolioName('');
      setEditError('');
    },
    onError: (error: Error) => {
      setEditError(error.message);
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPortfolioName.trim()) {
      createMutation.mutate({
        name: newPortfolioName.trim(),
        market: newPortfolioMarket,
      });
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, portfolio: Portfolio) => {
    e.stopPropagation();
    setPortfolioToDelete(portfolio);
    setIsDeleteModalOpen(true);
  };

  const handleEditClick = (e: React.MouseEvent, portfolio: Portfolio) => {
    e.stopPropagation();
    setPortfolioToEdit(portfolio);
    setEditPortfolioName(portfolio.name);
    setEditError('');
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!portfolioToEdit || !editPortfolioName.trim()) {
      return;
    }
    updateMutation.mutate({
      id: portfolioToEdit.id,
      name: editPortfolioName.trim(),
    });
  };

  const handleConfirmDelete = () => {
    if (portfolioToDelete) {
      deleteMutation.mutate(portfolioToDelete.id);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(getDateLocale(i18n.language), {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold">{t('myPortfolios.title')}</h1>
          <p
            className="text-sm mt-1"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            {t('myPortfolios.subtitle')}
          </p>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          {t('myPortfolios.createNew')}
        </Button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div
          className="rounded-lg border p-4 text-center"
          style={{
            borderColor: 'hsl(var(--destructive))',
            backgroundColor: 'hsl(var(--destructive) / 0.1)',
          }}
        >
          <p style={{ color: 'hsl(var(--destructive))' }}>
            {t('common.error')}: {(error as Error).message}
          </p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && portfolios.length === 0 && (
        <div
          className="rounded-lg border-2 border-dashed p-12 text-center"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          <div
            className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}
          >
            <Briefcase className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">
            {t('myPortfolios.empty.title')}
          </h3>
          <p
            className="mb-6 max-w-sm mx-auto"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            {t('myPortfolios.empty.description')}
          </p>
          <Button onClick={() => setIsCreateModalOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            {t('myPortfolios.createNew')}
          </Button>
        </div>
      )}

      {/* Portfolio Grid */}
      {!isLoading && !error && portfolios.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {portfolios.map((portfolio) => (
            <div
              key={portfolio.id}
              onClick={() => navigate(`/portfolio/${portfolio.slug}`)}
              className="group rounded-lg border p-5 cursor-pointer transition-all hover:shadow-md"
              style={{
                borderColor: 'hsl(var(--border))',
                backgroundColor: 'hsl(var(--card))',
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}
                >
                  <Briefcase className="h-5 w-5 text-primary" />
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => handleEditClick(e, portfolio)}
                  >
                    <Pencil className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => handleDeleteClick(e, portfolio)}
                  >
                    <Trash2 className="h-4 w-4" style={{ color: 'hsl(var(--destructive))' }} />
                  </Button>
                  <ChevronRight
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: 'hsl(var(--muted-foreground))' }}
                  />
                </div>
              </div>
              <h3 className="font-semibold text-lg mb-1">{portfolio.name}</h3>
              <div className="mb-2">
                <span
                  className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium"
                  style={{
                    backgroundColor: 'hsl(var(--muted))',
                    color: 'hsl(var(--muted-foreground))',
                  }}
                >
                  {t('myPortfolios.card.market', { market: portfolio.market })}
                </span>
              </div>
              <div
                className="flex items-center gap-3 text-sm"
                style={{ color: 'hsl(var(--muted-foreground))' }}
              >
                <span>
                  {portfolio.transaction_count && portfolio.transaction_count > 0
                    ? t('myPortfolios.card.transactions', {
                        count: portfolio.transaction_count,
                      })
                    : t('myPortfolios.card.noTransactions')}
                </span>
                <span>•</span>
                <span>
                  {t('myPortfolios.card.created', {
                    date: formatDate(portfolio.created_at),
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Portfolio Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setNewPortfolioName('');
          setNewPortfolioMarket('BIST');
          setCreateError('');
        }}
        title={t('myPortfolios.create.title')}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateModalOpen(false);
                setNewPortfolioName('');
                setNewPortfolioMarket('BIST');
                setCreateError('');
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleCreateSubmit}
              disabled={!newPortfolioName.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('common.create')
              )}
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateSubmit}>
          <div>
            <label
              htmlFor="portfolioName"
              className="block text-sm font-medium mb-2"
            >
              {t('myPortfolios.create.nameLabel')}
            </label>
            <input
              id="portfolioName"
              type="text"
              value={newPortfolioName}
              onChange={(e) => setNewPortfolioName(e.target.value)}
              placeholder={t('myPortfolios.create.namePlaceholder')}
              autoFocus
              className="w-full px-3 py-2 rounded-md border bg-transparent"
              style={{ borderColor: 'hsl(var(--input))' }}
            />
          </div>
          <div className="mt-4">
            <label
              htmlFor="portfolioMarket"
              className="block text-sm font-medium mb-2"
            >
              {t('myPortfolios.create.marketLabel')}
            </label>
            <select
              id="portfolioMarket"
              value={newPortfolioMarket}
              onChange={(e) => setNewPortfolioMarket(e.target.value as Market)}
              className="w-full px-3 py-2 rounded-md border bg-transparent"
              style={{ borderColor: 'hsl(var(--input))' }}
            >
              {MARKETS.map((market) => (
                <option key={market.value} value={market.value}>
                  {market.label}
                </option>
              ))}
            </select>
          </div>
          {createError && (
            <p
              className="text-sm mt-2"
              style={{ color: 'hsl(var(--destructive))' }}
            >
              {createError}
            </p>
          )}
        </form>
      </Modal>

      {/* Edit Portfolio Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setPortfolioToEdit(null);
          setEditPortfolioName('');
          setEditError('');
        }}
        title={t('myPortfolios.edit.title')}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditModalOpen(false);
                setPortfolioToEdit(null);
                setEditPortfolioName('');
                setEditError('');
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleEditSubmit}
              disabled={!editPortfolioName.trim() || updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('common.save')
              )}
            </Button>
          </>
        }
      >
        <form onSubmit={handleEditSubmit}>
          <div>
            <label
              htmlFor="editPortfolioName"
              className="block text-sm font-medium mb-2"
            >
              {t('myPortfolios.edit.nameLabel')}
            </label>
            <input
              id="editPortfolioName"
              type="text"
              value={editPortfolioName}
              onChange={(e) => setEditPortfolioName(e.target.value)}
              placeholder={t('myPortfolios.edit.namePlaceholder')}
              autoFocus
              className="w-full px-3 py-2 rounded-md border bg-transparent"
              style={{ borderColor: 'hsl(var(--input))' }}
            />
          </div>
          {editError && (
            <p
              className="text-sm mt-2"
              style={{ color: 'hsl(var(--destructive))' }}
            >
              {editError}
            </p>
          )}
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setPortfolioToDelete(null);
        }}
        title={t('portfolio.deleteConfirm.title')}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setPortfolioToDelete(null);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('portfolio.deleteConfirm.confirm')
              )}
            </Button>
          </>
        }
      >
        <p style={{ color: 'hsl(var(--muted-foreground))' }}>
          {t('portfolio.deleteConfirm.message', {
            name: portfolioToDelete?.name,
          })}
        </p>
      </Modal>
    </div>
  );
}
