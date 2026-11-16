"""Initial ZAYQORA multi-tenant PostgreSQL schema"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "restaurants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("slug", sa.String(80), nullable=False, unique=True),
        sa.Column("name", sa.String(140), nullable=False),
        sa.Column("category", sa.String(80), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="ACTIVE"),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("tax_rate", sa.Numeric(5, 4), nullable=False, server_default="0.085"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(180), nullable=False, unique=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("full_name", sa.String(140), nullable=False),
        sa.Column("role_code", sa.String(40), nullable=False),
        sa.Column("restaurant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("restaurants.id"), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("users")
    op.drop_table("restaurants")
