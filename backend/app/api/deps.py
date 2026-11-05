from typing import Annotated
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.db import get_db, Profile
from app.core.security import decode_access_token
from app.services import get_profile_by_id

security = HTTPBearer()


# Plain ``def``: the JWKS fetch and the profile query block, and in an
# ``async def`` one stuck call would freeze every request, /health included.
def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Annotated[Session, Depends(get_db)],
) -> Profile:
    """Dependency that returns the current authenticated user's profile."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    token = credentials.credentials
    user_id = decode_access_token(token)
    
    if user_id is None:
        raise credentials_exception
    
    profile = get_profile_by_id(db, user_id)
    
    if profile is None:
        raise credentials_exception
    
    return profile


# Type alias for cleaner dependency injection
CurrentUser = Annotated[Profile, Depends(get_current_user)]
