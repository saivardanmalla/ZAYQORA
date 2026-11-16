'use client';

import { useAuth } from '@clerk/nextjs';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { fastapiFetch } from '@/lib/api-client';

const menuItemSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(2).max(120),
  description: z.string().max(500),
  priceDollars: z.number().positive(),
  kitchenStation: z.enum(['WOOD_HEARTH', 'MAIN_GRILL', 'PASTRY_COLD', 'BAR_STATION']),
  isAvailable: z.boolean(),
});

type MenuItemFormValues = z.infer<typeof menuItemSchema>;

export function MenuItemForm({ categoryId }: { categoryId: string }) {
  const { getToken, orgId } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (values: MenuItemFormValues) => {
      const token = await getToken();
      return fastapiFetch('/api/v1/menu/items', {
        method: 'POST',
        token,
        orgId,
        body: JSON.stringify({
          ...values,
          priceCents: Math.round(values.priceDollars * 100),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items', orgId] });
    },
  });

  const form = useForm({
    defaultValues: {
      categoryId,
      name: '',
      description: '',
      priceDollars: 18,
      kitchenStation: 'MAIN_GRILL',
      isAvailable: true,
    } as MenuItemFormValues,
    onSubmit: async ({ value }: { value: MenuItemFormValues }) => {
      const parsed = menuItemSchema.parse(value);
      await mutation.mutateAsync(parsed);
      form.reset();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="space-y-4 rounded-xl border border-[#E2E8F0] bg-white p-6"
    >
      <h3 className="text-base font-bold text-[#101D35]">Add Menu Dish</h3>
      <form.Field name="name">
        {(field: { state: { value: string }; handleChange: (v: string) => void }) => (
          <div>
            <label className="mb-1 block text-xs font-medium text-[#64748B]">Dish Name</label>
            <input
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
              placeholder="Charred Octopus & Saffron Aioli"
            />
          </div>
        )}
      </form.Field>
      <form.Field name="priceDollars">
        {(field: { state: { value: number }; handleChange: (v: number) => void }) => (
          <div>
            <label className="mb-1 block text-xs font-medium text-[#64748B]">Price ($)</label>
            <input
              type="number"
              step="0.5"
              value={field.state.value}
              onChange={(e) => field.handleChange(Number(e.target.value))}
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 font-mono text-sm"
            />
          </div>
        )}
      </form.Field>
      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded-lg bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F766E]"
      >
        {mutation.isPending ? 'Saving...' : 'Create Dish'}
      </button>
    </form>
  );
}
