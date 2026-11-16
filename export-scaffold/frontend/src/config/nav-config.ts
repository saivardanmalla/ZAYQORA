export interface ZayqoraNavItem {
  title: string;
  url: string;
  icon: string;
  shortcut?: [string, string];
  isActive?: boolean;
  items?: ZayqoraNavItem[];
}

export const restaurantNavItems: ZayqoraNavItem[] = [
  {
    title: 'Overview',
    url: '/dashboard/overview',
    icon: 'dashboard',
    shortcut: ['d', 'o'],
  },
  {
    title: 'Orders',
    url: '/dashboard/orders',
    icon: 'shoppingBag',
    shortcut: ['o', 'r'],
  },
  {
    title: 'Menu Management',
    url: '/dashboard/menu',
    icon: 'utensils',
    shortcut: ['m', 'e'],
  },
  {
    title: 'Reservations',
    url: '/dashboard/reservations',
    icon: 'calendar',
  },
  {
    title: 'Tables & Floor',
    url: '/dashboard/tables',
    icon: 'grid',
  },
  {
    title: 'Kitchen Display',
    url: '/dashboard/kitchen',
    icon: 'chefHat',
  },
  {
    title: 'Customers',
    url: '/dashboard/customers',
    icon: 'users',
  },
  {
    title: 'Staff Management',
    url: '/dashboard/staff',
    icon: 'userCog',
  },
  {
    title: 'Inventory',
    url: '/dashboard/inventory',
    icon: 'package',
  },
  {
    title: 'Offers & Coupons',
    url: '/dashboard/offers',
    icon: 'tag',
  },
  {
    title: 'Reports',
    url: '/dashboard/reports',
    icon: 'barChart',
  },
  {
    title: 'Website Builder',
    url: '/dashboard/website-builder',
    icon: 'globe',
  },
  {
    title: 'Settings',
    url: '/dashboard/settings',
    icon: 'settings',
  },
  {
    title: 'Billing',
    url: '/dashboard/billing',
    icon: 'creditCard',
  },
];

export const platformAdminNavItems: ZayqoraNavItem[] = [
  { title: 'Platform Overview', url: '/platform/overview', icon: 'dashboard' },
  { title: 'Tenants', url: '/platform/tenants', icon: 'building' },
  { title: 'Subscription Plans', url: '/platform/plans', icon: 'layers' },
  { title: 'Platform Billing', url: '/platform/billing', icon: 'creditCard' },
  { title: 'Support Tickets', url: '/platform/support', icon: 'lifeBuoy' },
];
