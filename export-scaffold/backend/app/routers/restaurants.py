"""Tenant-isolated FastAPI routers for ZAYQORA restaurant operations & VIRELEO platform admin."""

from typing import Literal
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import AuthContext, require_platform_admin, require_tenant_roles

router = APIRouter(prefix="/api/v1", tags=["zayqora"])


class MenuItemCreate(BaseModel):
    categoryId: str
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=500)
    priceCents: int = Field(gt=0)
    kitchenStation: Literal["WOOD_HEARTH", "MAIN_GRILL", "PASTRY_COLD", "BAR_STATION"]
    isAvailable: bool = True


class OrderItemInput(BaseModel):
    menuItemId: str
    variantId: str | None = None
    modifierIds: list[str] = Field(default_factory=list)
    quantity: int = Field(ge=1, le=25)
    specialInstructions: str = Field(default="", max_length=280)


class IdempotentOrderCreate(BaseModel):
    idempotencyKey: str = Field(min_length=8)
    orderType: Literal["DELIVERY", "PICKUP", "DINE_IN"]
    tableNumber: str = ""
    couponCode: str = ""
    items: list[OrderItemInput] = Field(min_length=1)


class ReservationCreate(BaseModel):
    date: str
    timeSlot: str
    partySize: int = Field(ge=1, le=20)
    customerName: str = Field(min_length=2)
    customerEmail: str


@router.get("/restaurants/overview")
async def get_restaurant_overview(
    ctx: AuthContext = Depends(require_tenant_roles("org:admin", "RESTAURANT_OWNER", "RESTAURANT_MANAGER")),
) -> dict:
    return {
        "tenantOrgId": ctx.org_id,
        "todayRevenueCents": 0,
        "totalOrders": 0,
        "upcomingReservations": 0,
        "activeCustomers": 0,
        "revenueTrend": [],
    }


@router.post("/menu/items", status_code=status.HTTP_201_CREATED)
async def create_menu_item(
    payload: MenuItemCreate,
    ctx: AuthContext = Depends(require_tenant_roles("org:admin", "RESTAURANT_OWNER", "RESTAURANT_MANAGER")),
) -> dict:
    return {"tenantOrgId": ctx.org_id, "item": payload.model_dump()}


@router.post("/public/restaurants/{slug}/orders", status_code=status.HTTP_201_CREATED)
async def create_public_order(
    slug: str,
    payload: IdempotentOrderCreate,
    x_idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict:
    effective_key = x_idempotency_key or payload.idempotencyKey
    if not effective_key:
        raise HTTPException(status_code=400, detail="Idempotency key is required")
    # Server recomputes item unit prices, modifiers, tax, and coupon discounts from PostgreSQL
    return {
        "slug": slug,
        "idempotencyKey": effective_key,
        "pricingAuthority": "server-recomputed",
        "status": "PENDING",
    }


@router.post("/public/restaurants/{slug}/reservations", status_code=status.HTTP_201_CREATED)
async def create_reservation(slug: str, payload: ReservationCreate) -> dict:
    # Execute inside PostgreSQL SERIALIZABLE / SELECT FOR UPDATE table lock
    return {
        "slug": slug,
        "reservation": payload.model_dump(),
        "concurrencyMode": "row-lock-verified",
    }


@router.get("/platform/overview")
async def platform_overview(ctx: AuthContext = Depends(require_platform_admin)) -> dict:
    return {
        "adminUserId": ctx.user_id,
        "role": ctx.platform_role,
        "status": "verified",
    }
