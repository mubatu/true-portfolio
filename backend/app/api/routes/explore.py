from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.services.explore import get_public_portfolio, list_public_portfolios

# No authentication: these serve public portfolios to anyone, reduced to
# percentages (see app/services/explore.py).
router = APIRouter(prefix="/explore", tags=["Explore"])


@router.get("/portfolios")
def get_public_portfolios(db: Annotated[Session, Depends(get_db)]):
    """Every public portfolio with trades, best since-start return first."""
    return list_public_portfolios(db)


@router.get("/portfolios/{slug}")
def get_public_portfolio_detail(slug: str, db: Annotated[Session, Depends(get_db)]):
    """Unit price series and current allocation of one public portfolio."""
    result = get_public_portfolio(db, slug)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Portfolio not found")
    return result
