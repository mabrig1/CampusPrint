// All prices in Naira
export const PRICING = {
  black_white: {
    A4: { single: 20, double: 30 },
    A3: { single: 35, double: 50 },
    Letter: { single: 20, double: 30 },
  },
  color: {
    A4: { single: 50, double: 80 },
    A3: { single: 80, double: 120 },
    Letter: { single: 50, double: 80 },
  },
  binding: {
    staple: 50,
    spiral: 200,
    none: 0,
  },
};

export const calculateOrderTotal = (files) => {
  const breakdown = [];
  let subtotal = 0;

  for (const file of files) {
    const { colorMode, paperSize, doubleSided, binding, pages, copies } = file;
    const side = doubleSided ? 'double' : 'single';
    const pricePerPage = PRICING[colorMode]?.[paperSize]?.[side] ?? 20;
    const bindingCost = PRICING.binding[binding] ?? 0;
    const fileCost = (pricePerPage * pages + bindingCost) * copies;

    breakdown.push({
      name: file.name,
      pages,
      copies,
      pricePerPage,
      bindingCost,
      fileCost,
    });

    subtotal += fileCost;
  }

  return { subtotal, totalAmount: subtotal, breakdown };
};
