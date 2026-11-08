"""add purchased_at to gifts

Revision ID: a1b2c3d4e5f6
Revises: e721ca9a6ebf
Create Date: 2026-05-24 20:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = "e9730fad709a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "gifts",
        sa.Column("purchased_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("gifts", schema=None) as batch_op:
        batch_op.drop_column("purchased_at")
