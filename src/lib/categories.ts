export interface Category {
  id: string;
  name: string;
  icon: string;
  section: string;
}

const SECTION_COLORS: Record<string, string> = {
  General: '#9aa4ae',
  'Food and drink': '#f0a43a',
  Entertainment: '#8f6bd9',
  Home: '#5aa9e6',
  Life: '#e46f8c',
  Transportation: '#2fb39a',
  Utilities: '#7d8fa3',
  Payment: '#1cc29f',
};

export const CATEGORIES: Category[] = [
  { id: 'general', name: 'General', icon: '🧾', section: 'General' },
  { id: 'dining', name: 'Dining out', icon: '🍽️', section: 'Food and drink' },
  { id: 'groceries', name: 'Groceries', icon: '🛒', section: 'Food and drink' },
  { id: 'liquor', name: 'Liquor', icon: '🍺', section: 'Food and drink' },
  { id: 'food', name: 'Food & snacks', icon: '🍕', section: 'Food and drink' },
  { id: 'movies', name: 'Movies', icon: '🎬', section: 'Entertainment' },
  { id: 'games', name: 'Games', icon: '🎮', section: 'Entertainment' },
  { id: 'music', name: 'Music', icon: '🎵', section: 'Entertainment' },
  { id: 'sports', name: 'Sports', icon: '⚽', section: 'Entertainment' },
  { id: 'entertainment', name: 'Other fun', icon: '🎉', section: 'Entertainment' },
  { id: 'rent', name: 'Rent', icon: '🏠', section: 'Home' },
  { id: 'household', name: 'Household supplies', icon: '🧴', section: 'Home' },
  { id: 'furniture', name: 'Furniture', icon: '🛋️', section: 'Home' },
  { id: 'maintenance', name: 'Maintenance', icon: '🔧', section: 'Home' },
  { id: 'electronics', name: 'Electronics', icon: '💻', section: 'Home' },
  { id: 'pets', name: 'Pets', icon: '🐾', section: 'Home' },
  { id: 'services', name: 'Services', icon: '🧹', section: 'Home' },
  { id: 'clothing', name: 'Clothing', icon: '👕', section: 'Life' },
  { id: 'education', name: 'Education', icon: '📚', section: 'Life' },
  { id: 'gifts', name: 'Gifts', icon: '🎁', section: 'Life' },
  { id: 'medical', name: 'Medical', icon: '💊', section: 'Life' },
  { id: 'insurance', name: 'Insurance', icon: '🛡️', section: 'Life' },
  { id: 'childcare', name: 'Childcare', icon: '🧸', section: 'Life' },
  { id: 'taxes', name: 'Taxes', icon: '🏛️', section: 'Life' },
  { id: 'bus', name: 'Bus / train', icon: '🚆', section: 'Transportation' },
  { id: 'car', name: 'Car', icon: '🚗', section: 'Transportation' },
  { id: 'fuel', name: 'Fuel', icon: '⛽', section: 'Transportation' },
  { id: 'parking', name: 'Parking', icon: '🅿️', section: 'Transportation' },
  { id: 'plane', name: 'Plane', icon: '✈️', section: 'Transportation' },
  { id: 'taxi', name: 'Taxi', icon: '🚕', section: 'Transportation' },
  { id: 'hotel', name: 'Hotel', icon: '🏨', section: 'Transportation' },
  { id: 'electricity', name: 'Electricity', icon: '💡', section: 'Utilities' },
  { id: 'gas', name: 'Heat / gas', icon: '🔥', section: 'Utilities' },
  { id: 'water', name: 'Water', icon: '🚰', section: 'Utilities' },
  { id: 'internet', name: 'Phone / internet / TV', icon: '📶', section: 'Utilities' },
  { id: 'cleaning', name: 'Cleaning / trash', icon: '🗑️', section: 'Utilities' },
  { id: 'payment', name: 'Payment', icon: '💵', section: 'Payment' },
];

const BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

export function category(id: string | undefined): Category {
  return BY_ID[id ?? ''] ?? BY_ID.general;
}

export function categoryColor(id: string | undefined): string {
  return SECTION_COLORS[category(id).section];
}

const KEYWORDS: [RegExp, string][] = [
  [/\b(dinner|lunch|breakfast|restaurant|cafe|coffee|brunch|swiggy|zomato|dine)/i, 'dining'],
  [/\b(grocer|vegetable|fruits?|milk|bigbasket|blinkit|zepto|instamart|supermarket|dmart)/i, 'groceries'],
  [/\b(beer|wine|drinks?|bar|pub|liquor|whisky|vodka)/i, 'liquor'],
  [/\b(pizza|snack|burger|food|chai|tea|ice ?cream|dessert)/i, 'food'],
  [/\b(movie|cinema|netflix|prime|hotstar|film|pvr|inox)/i, 'movies'],
  [/\b(rent|deposit|lease)/i, 'rent'],
  [/\b(uber|ola|taxi|cab|auto|rapido|lyft)/i, 'taxi'],
  [/\b(petrol|diesel|fuel|gas station|cng)/i, 'fuel'],
  [/\b(flight|airline|indigo|plane|airport)/i, 'plane'],
  [/\b(train|bus|metro|irctc)/i, 'bus'],
  [/\b(hotel|airbnb|hostel|stay|resort|oyo)/i, 'hotel'],
  [/\b(electricity|power bill|bescom|light bill)/i, 'electricity'],
  [/\b(wifi|internet|broadband|phone|mobile recharge|jio|airtel|recharge)/i, 'internet'],
  [/\b(water)/i, 'water'],
  [/\b(gift|birthday|present)/i, 'gifts'],
  [/\b(doctor|medicine|pharmacy|hospital|medical)/i, 'medical'],
  [/\b(parking|toll)/i, 'parking'],
  [/\b(clothes|shirt|shoes|clothing)/i, 'clothing'],
  [/\b(maid|cook|cleaning|laundry|plumber|electrician)/i, 'services'],
];

export function guessCategory(description: string): string | null {
  for (const [re, id] of KEYWORDS) if (re.test(description)) return id;
  return null;
}
