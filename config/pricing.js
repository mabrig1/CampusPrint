// ── Tiered B&W pricing (per page, based on total pages in that file) ──
const bwTieredRate = (pages) => {
  if (pages >= 10) return 30;
  if (pages >= 5)  return 40;
  return 50;
};

// ── Service types ──
export const SERVICES = {
  print_bw:    { label: 'B&W Printing',         unit: 'page' },
  print_color: { label: 'Colour Printing',       unit: 'page' },
  editing:     { label: 'Editing & Formatting',  unit: 'page' },
  cv_design:   { label: 'CV / Resume Design',    unit: 'flat' },
  thesis:      { label: 'Thesis Formatting',     unit: 'flat' },
  scanning:    { label: 'Scanning',              unit: 'page' },
  lamination:  { label: 'Lamination',            unit: 'page' },
  passport:    { label: 'Passport Photography',  unit: 'flat' },
  registration:{ label: 'Online Registration',   unit: 'flat' },
};

// ── Flat-rate prices for non-per-page services (in Naira) ──
export const FLAT_PRICES = {
  cv_design:    2000,
  thesis:       5000,
  passport:     1500,
  registration: 500,
};

// ── Per-page prices ──
export const PAGE_PRICES = {
  print_color: 200,
  editing:     50,
  scanning:    30,
  lamination:  150,
};

export const BINDING_PRICES = {
  none:   0,
  staple: 50,
  spiral: 200,
  hardcover: 1500,
};

// ── Main calculator ──
export const calculateOrderTotal = (files) => {
  const breakdown = [];
  let subtotal = 0;

  for (const file of files) {
    const {
      name,
      serviceType = 'print_bw',
      pages = 1,
      copies = 1,
      colorMode,         // legacy fallback
      paperSize = 'A4',
      doubleSided = false,
      binding = 'none',
    } = file;

    let pricePerPage = 0;
    let flatCost = 0;
    let bindingCost = BINDING_PRICES[binding] ?? 0;
    let label = '';

    const effectiveService = serviceType || (colorMode === 'color' ? 'print_color' : 'print_bw');

    switch (effectiveService) {
      case 'print_bw': {
        const totalPages = pages * copies;
        pricePerPage = bwTieredRate(totalPages);
        label = `B&W (${totalPages >= 10 ? '₦30' : totalPages >= 5 ? '₦40' : '₦50'}/pg tier)`;
        break;
      }
      case 'print_color':
        pricePerPage = PAGE_PRICES.print_color;
        label = 'Colour (₦200/pg)';
        break;
      case 'editing':
        pricePerPage = PAGE_PRICES.editing;
        label = 'Editing (₦50/pg)';
        break;
      case 'scanning':
        pricePerPage = PAGE_PRICES.scanning;
        label = 'Scanning (₦30/pg)';
        bindingCost = 0;
        break;
      case 'lamination':
        pricePerPage = PAGE_PRICES.lamination;
        label = 'Lamination (₦150/pg)';
        bindingCost = 0;
        break;
      case 'cv_design':
      case 'thesis':
      case 'passport':
      case 'registration':
        flatCost = FLAT_PRICES[effectiveService] ?? 0;
        label = SERVICES[effectiveService]?.label ?? effectiveService;
        bindingCost = 0;
        break;
      default:
        pricePerPage = bwTieredRate(pages);
        label = 'B&W Printing';
    }

    const pageCost = pricePerPage * pages * copies;
    const fileCost = flatCost > 0 ? flatCost : (pageCost + bindingCost * copies);

    breakdown.push({
      name,
      service: label,
      pages,
      copies,
      pricePerPage: flatCost > 0 ? null : pricePerPage,
      flatCost:     flatCost > 0 ? flatCost : null,
      bindingCost,
      fileCost,
    });

    subtotal += fileCost;
  }

  return { subtotal, totalAmount: subtotal, breakdown };
};
