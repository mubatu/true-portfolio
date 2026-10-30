import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Names the browser tab after the page alone ("Portföylerim"); the
 * product name is the title only where no page title is given (the
 * landing page, or while a page's own name is still loading).
 */
export function useDocumentTitle(title?: string | null) {
  const { t } = useTranslation();
  useEffect(() => {
    document.title = title || t('common.appName');
  }, [title, t]);
}
