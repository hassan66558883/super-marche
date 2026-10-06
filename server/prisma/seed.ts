/* eslint-disable no-console */
/**
 * TECHNOVA POS — development / demo seed (idempotent: safe to re-run).
 *
 * Development accounts (CHANGE IN PRODUCTION):
 *   superadmin / Admin@2026    SUPER_ADMIN, all branches
 *   admin      / Admin@2026    ADMIN, all branches
 *   manager    / Manager@2026  MANAGER, N'Djamena Centre + Sud
 *   cashier    / Caisse@2026   CASHIER, N'Djamena Centre
 *   cashier2   / Caisse@2026   CASHIER, Moundou
 *   stock      / Stock@2026    STOCK_MANAGER, N'Djamena Centre
 *   comptable  / Compta@2026   ACCOUNTANT, all branches
 */
import { PrismaClient, Prisma } from '@prisma/client';
import argon2 from 'argon2';
import { ALL_PERMISSIONS, DEFAULT_ROLES, PERMISSIONS } from '../src/config/permissions.js';
import { generateInternalEan13 } from '../src/utils/barcode.js';

const prisma = new PrismaClient();
const hash = (p: string) => argon2.hash(p, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
const dec = (v: number | string) => new Prisma.Decimal(v);

export const DEV_USERS = [
  { username: 'superadmin', fullName: 'Super Administrateur', password: 'Admin@2026', role: 'SUPER_ADMIN', branches: ['NDJ', 'NDS', 'MOU'], email: 'superadmin@technova.td' },
  { username: 'admin', fullName: 'Mahamat Abakar', password: 'Admin@2026', role: 'ADMIN', branches: ['NDJ', 'NDS', 'MOU'], email: 'admin@technova.td' },
  { username: 'manager', fullName: 'Fatimé Haroun', password: 'Manager@2026', role: 'MANAGER', branches: ['NDJ', 'NDS'], email: 'manager@technova.td' },
  { username: 'cashier', fullName: 'Ousmane Djibrine', password: 'Caisse@2026', role: 'CASHIER', branches: ['NDJ'], email: 'caisse@technova.td' },
  { username: 'cashier2', fullName: 'Achta Mbaïdoum', password: 'Caisse@2026', role: 'CASHIER', branches: ['MOU'], email: 'caisse.moundou@technova.td' },
  { username: 'stock', fullName: 'Idriss Nadjim', password: 'Stock@2026', role: 'STOCK_MANAGER', branches: ['NDJ'], email: 'stock@technova.td' },
  { username: 'comptable', fullName: 'Rose Ndoubaye', password: 'Compta@2026', role: 'ACCOUNTANT', branches: ['NDJ', 'NDS', 'MOU'], email: 'compta@technova.td' },
];

const BRANCHES = [
  { code: 'NDJ', name: "N'Djamena Centre", city: "N'Djamena", address: 'Avenue Charles de Gaulle, 1er arrondissement', phone: '+235 22 51 00 01', isHeadOffice: true },
  { code: 'NDS', name: "N'Djamena Sud", city: "N'Djamena", address: 'Quartier Chagoua, 7e arrondissement', phone: '+235 22 51 00 02', isHeadOffice: false },
  { code: 'MOU', name: 'Moundou', city: 'Moundou', address: 'Avenue du Marché Central', phone: '+235 22 69 00 03', isHeadOffice: false },
];

const UNITS = [
  { code: 'PCS', name: 'Pièce', nameEn: 'Piece', nameAr: 'قطعة', allowDecimal: false },
  { code: 'BOX', name: 'Boîte', nameEn: 'Box', nameAr: 'علبة', allowDecimal: false },
  { code: 'CTN', name: 'Carton', nameEn: 'Carton', nameAr: 'كرتون', allowDecimal: false },
  { code: 'KG', name: 'Kilogramme', nameEn: 'Kilogram', nameAr: 'كيلوغرام', allowDecimal: true },
  { code: 'G', name: 'Gramme', nameEn: 'Gram', nameAr: 'غرام', allowDecimal: true },
  { code: 'L', name: 'Litre', nameEn: 'Liter', nameAr: 'لتر', allowDecimal: true },
  { code: 'ML', name: 'Millilitre', nameEn: 'Milliliter', nameAr: 'ملليلتر', allowDecimal: true },
  { code: 'M', name: 'Mètre', nameEn: 'Meter', nameAr: 'متر', allowDecimal: true },
  { code: 'SAC', name: 'Sac', nameEn: 'Bag', nameAr: 'كيس', allowDecimal: false },
];

const CATEGORIES = [
  { key: 'BOI', name: 'Boissons', nameEn: 'Beverages', nameAr: 'مشروبات', icon: 'CupSoda', color: '#0ea5e9' },
  { key: 'ALI', name: 'Alimentation', nameEn: 'Groceries', nameAr: 'مواد غذائية', icon: 'Wheat', color: '#f59e0b' },
  { key: 'LAI', name: 'Laiterie', nameEn: 'Dairy', nameAr: 'ألبان', icon: 'Milk', color: '#6366f1' },
  { key: 'HYG', name: 'Hygiène', nameEn: 'Hygiene', nameAr: 'نظافة', icon: 'Droplets', color: '#14b8a6' },
  { key: 'COS', name: 'Cosmétiques', nameEn: 'Cosmetics', nameAr: 'مستحضرات تجميل', icon: 'Sparkles', color: '#ec4899' },
  { key: 'PAP', name: 'Papeterie', nameEn: 'Stationery', nameAr: 'قرطاسية', icon: 'PenLine', color: '#8b5cf6' },
  { key: 'ELE', name: 'Électronique', nameEn: 'Electronics', nameAr: 'إلكترونيات', icon: 'Smartphone', color: '#64748b' },
  { key: 'PHA', name: 'Pharmacie', nameEn: 'Pharmacy', nameAr: 'صيدلية', icon: 'Pill', color: '#ef4444' },
  { key: 'BOU', name: 'Boulangerie', nameEn: 'Bakery', nameAr: 'مخبز', icon: 'Croissant', color: '#d97706' },
  { key: 'ENT', name: 'Entretien', nameEn: 'Household', nameAr: 'منظفات', icon: 'SprayCan', color: '#22c55e' },
];

const BRANDS = ['Coca-Cola', 'Pepsi', 'Nestlé', 'Lipton', 'Président', 'Dangote', 'Omo', 'Nivea', 'Colgate', 'Bic', 'Samsung', 'Tecno', 'Uncle Bens', 'Panzani', 'Lesieur', 'Gloria', 'Danone', 'Madar', 'Maggi', 'Royal'];

// [sku, name, nameEn, nameAr, category, brand, unit, purchase, selling, wholesale, minStock, quick, tax?]
type P = [string, string, string, string, string, string | null, string, number, number, number | null, number, boolean, string?];
const PRODUCTS: P[] = [
  ['BOI-001', 'Coca Cola 33cl', 'Coca Cola 33cl', 'كوكا كولا 33 سل', 'BOI', 'Coca-Cola', 'PCS', 300, 500, 450, 48, true],
  ['BOI-002', 'Coca Cola 1,5L', 'Coca Cola 1.5L', 'كوكا كولا 1.5 لتر', 'BOI', 'Coca-Cola', 'PCS', 700, 1000, 900, 24, true],
  ['BOI-003', 'Pepsi 33cl', 'Pepsi 33cl', 'بيبسي 33 سل', 'BOI', 'Pepsi', 'PCS', 280, 450, 400, 48, true],
  ['BOI-004', 'Fanta Orange 33cl', 'Fanta Orange 33cl', 'فانتا برتقال', 'BOI', 'Coca-Cola', 'PCS', 300, 500, 450, 48, true],
  ['BOI-005', 'Sprite 33cl', 'Sprite 33cl', 'سبرايت 33 سل', 'BOI', 'Coca-Cola', 'PCS', 300, 500, 450, 24, false],
  ['BOI-006', 'Eau minérale 1,5L', 'Mineral water 1.5L', 'مياه معدنية 1.5 لتر', 'BOI', null, 'PCS', 250, 400, 350, 60, true],
  ['BOI-007', 'Eau minérale 50cl', 'Mineral water 50cl', 'مياه معدنية 50 سل', 'BOI', null, 'PCS', 120, 200, 175, 96, true],
  ['BOI-008', 'Jus de bissap 1L', 'Hibiscus juice 1L', 'عصير كركدي 1 لتر', 'BOI', null, 'PCS', 600, 1000, 900, 12, false],
  ['BOI-009', 'Jus de mangue 1L', 'Mango juice 1L', 'عصير مانجو 1 لتر', 'BOI', null, 'PCS', 900, 1500, 1300, 12, false],
  ['BOI-010', 'Malta Guinness 33cl', 'Malta Guinness 33cl', 'مالطا غينيس', 'BOI', null, 'PCS', 400, 650, 600, 24, false],
  ['ALI-001', 'Riz parfumé 5kg', 'Fragrant rice 5kg', 'أرز معطر 5 كغ', 'ALI', 'Royal', 'SAC', 4200, 5500, 5000, 20, true],
  ['ALI-002', 'Riz brisé 25kg', 'Broken rice 25kg', 'أرز مكسور 25 كغ', 'ALI', null, 'SAC', 15000, 18500, 17500, 10, false],
  ['ALI-003', 'Sucre en poudre 1kg', 'Sugar 1kg', 'سكر 1 كغ', 'ALI', null, 'KG', 650, 850, 800, 50, true],
  ['ALI-004', 'Sucre en morceaux 1kg', 'Sugar cubes 1kg', 'سكر مكعبات 1 كغ', 'ALI', null, 'BOX', 800, 1100, 1000, 30, false],
  ['ALI-005', 'Farine de blé 1kg', 'Wheat flour 1kg', 'دقيق القمح 1 كغ', 'ALI', 'Dangote', 'KG', 550, 750, 700, 40, true],
  ['ALI-006', 'Huile végétale 1L', 'Vegetable oil 1L', 'زيت نباتي 1 لتر', 'ALI', 'Lesieur', 'L', 1100, 1500, 1400, 30, true],
  ['ALI-007', 'Huile végétale 5L', 'Vegetable oil 5L', 'زيت نباتي 5 لتر', 'ALI', 'Lesieur', 'PCS', 5200, 6800, 6400, 10, false],
  ['ALI-008', 'Spaghetti 500g', 'Spaghetti 500g', 'سباغيتي 500 غ', 'ALI', 'Panzani', 'PCS', 350, 500, 450, 40, true],
  ['ALI-009', 'Macaroni 500g', 'Macaroni 500g', 'معكرونة 500 غ', 'ALI', 'Panzani', 'PCS', 350, 500, 450, 30, false],
  ['ALI-010', 'Concentré de tomate 70g', 'Tomato paste 70g', 'معجون طماطم 70 غ', 'ALI', null, 'PCS', 100, 150, 125, 100, false],
  ['ALI-011', 'Bouillon cube (boîte de 60)', 'Stock cubes (60)', 'مكعبات مرق', 'ALI', 'Maggi', 'BOX', 1300, 1800, 1650, 20, true],
  ['ALI-012', 'Sel iodé 1kg', 'Iodized salt 1kg', 'ملح 1 كغ', 'ALI', null, 'KG', 200, 300, 275, 30, false],
  ['ALI-013', 'Haricots secs 1kg', 'Dry beans 1kg', 'فاصوليا 1 كغ', 'ALI', null, 'KG', 700, 1000, 900, 20, false],
  ['ALI-014', 'Arachides grillées 500g', 'Roasted peanuts 500g', 'فول سوداني 500 غ', 'ALI', null, 'PCS', 500, 750, 700, 20, false],
  ['ALI-015', 'Thé vert 200g', 'Green tea 200g', 'شاي أخضر 200 غ', 'ALI', null, 'PCS', 900, 1300, 1200, 25, true],
  ['ALI-016', 'Thé Lipton (25 sachets)', 'Lipton tea (25 bags)', 'شاي ليبتون', 'ALI', 'Lipton', 'BOX', 750, 1100, 1000, 25, true],
  ['ALI-017', 'Café Nescafé 50g', 'Nescafe coffee 50g', 'نسكافيه 50 غ', 'ALI', 'Nestlé', 'PCS', 1100, 1600, 1450, 15, false],
  ['ALI-018', 'Biscuits Choco 150g', 'Chocolate biscuits 150g', 'بسكويت شوكولاتة', 'ALI', null, 'PCS', 250, 400, 350, 40, true],
  ['ALI-019', 'Biscuits secs 200g', 'Dry biscuits 200g', 'بسكويت جاف 200 غ', 'ALI', null, 'PCS', 200, 350, 300, 40, false],
  ['ALI-020', 'Sardines à l’huile 125g', 'Sardines in oil 125g', 'سردين بالزيت', 'ALI', null, 'PCS', 450, 650, 600, 30, false],
  ['ALI-021', 'Mayonnaise 500ml', 'Mayonnaise 500ml', 'مايونيز 500 مل', 'ALI', 'Lesieur', 'PCS', 1300, 1800, 1650, 10, false],
  ['LAI-001', 'Lait en poudre Nido 400g', 'Nido powdered milk 400g', 'حليب نيدو 400 غ', 'LAI', 'Nestlé', 'BOX', 2400, 3200, 3000, 15, true],
  ['LAI-002', 'Lait concentré sucré 397g', 'Sweetened condensed milk', 'حليب مكثف محلى', 'LAI', 'Gloria', 'PCS', 650, 900, 850, 30, true],
  ['LAI-003', 'Lait UHT 1L', 'UHT milk 1L', 'حليب 1 لتر', 'LAI', 'Président', 'PCS', 900, 1200, 1100, 24, false],
  ['LAI-004', 'Yaourt nature 125g', 'Plain yogurt 125g', 'زبادي 125 غ', 'LAI', 'Danone', 'PCS', 250, 400, 350, 36, true],
  ['LAI-005', 'Fromage La Vache qui rit (8)', 'Laughing Cow cheese (8)', 'جبنة البقرة الضاحكة', 'LAI', null, 'BOX', 900, 1300, 1200, 20, false],
  ['LAI-006', 'Beurre doux 250g', 'Butter 250g', 'زبدة 250 غ', 'LAI', 'Président', 'PCS', 1400, 1900, 1750, 10, false],
  ['HYG-001', 'Savon de toilette 125g', 'Toilet soap 125g', 'صابون 125 غ', 'HYG', null, 'PCS', 200, 350, 300, 50, true],
  ['HYG-002', 'Dentifrice Colgate 75ml', 'Colgate toothpaste 75ml', 'معجون أسنان كولجيت', 'HYG', 'Colgate', 'PCS', 550, 800, 750, 30, true],
  ['HYG-003', 'Brosse à dents', 'Toothbrush', 'فرشاة أسنان', 'HYG', 'Colgate', 'PCS', 250, 400, 350, 30, false],
  ['HYG-004', 'Papier hygiénique (4 rouleaux)', 'Toilet paper (4 rolls)', 'ورق حمام 4', 'HYG', null, 'PCS', 700, 1000, 900, 20, false],
  ['HYG-005', 'Couches bébé taille 3 (30)', 'Baby diapers size 3 (30)', 'حفاضات أطفال', 'HYG', null, 'PCS', 4500, 6000, 5600, 8, false],
  ['HYG-006', 'Serviettes hygiéniques (10)', 'Sanitary pads (10)', 'فوط صحية', 'HYG', null, 'PCS', 450, 700, 650, 20, false],
  ['COS-001', 'Crème Nivea 200ml', 'Nivea cream 200ml', 'كريم نيفيا 200 مل', 'COS', 'Nivea', 'PCS', 2000, 2800, 2600, 10, true],
  ['COS-002', 'Lait corporel 400ml', 'Body lotion 400ml', 'لوشن للجسم', 'COS', 'Nivea', 'PCS', 2200, 3200, 3000, 10, false],
  ['COS-003', 'Huile de karité 250ml', 'Shea butter oil 250ml', 'زيت الشيا', 'COS', null, 'PCS', 1200, 2000, 1800, 10, false],
  ['COS-004', 'Parfum déodorant 150ml', 'Deodorant 150ml', 'مزيل عرق', 'COS', 'Nivea', 'PCS', 1600, 2400, 2200, 10, false],
  ['COS-005', 'Vaseline 250ml', 'Petroleum jelly 250ml', 'فازلين', 'COS', null, 'PCS', 800, 1200, 1100, 15, false],
  ['PAP-001', 'Cahier 100 pages', 'Notebook 100 pages', 'دفتر 100 صفحة', 'PAP', null, 'PCS', 200, 350, 300, 50, true],
  ['PAP-002', 'Stylo à bille bleu', 'Blue ballpoint pen', 'قلم حبر أزرق', 'PAP', 'Bic', 'PCS', 60, 100, 85, 100, true],
  ['PAP-003', 'Crayon à papier HB', 'HB pencil', 'قلم رصاص', 'PAP', 'Bic', 'PCS', 40, 75, 60, 100, false],
  ['PAP-004', 'Rame papier A4 (500)', 'A4 paper ream (500)', 'ورق A4', 'PAP', null, 'PCS', 2800, 3800, 3500, 10, false],
  ['PAP-005', 'Règle 30cm', 'Ruler 30cm', 'مسطرة 30 سم', 'PAP', null, 'PCS', 100, 200, 150, 30, false],
  ['ELE-001', 'Chargeur USB-C', 'USB-C charger', 'شاحن USB-C', 'ELE', 'Tecno', 'PCS', 2000, 3500, 3000, 5, true],
  ['ELE-002', 'Écouteurs filaires', 'Wired earphones', 'سماعات', 'ELE', 'Samsung', 'PCS', 1500, 2500, 2200, 5, false],
  ['ELE-003', 'Piles AA (4)', 'AA batteries (4)', 'بطاريات AA', 'ELE', null, 'PCS', 600, 1000, 900, 20, false],
  ['ELE-004', 'Ampoule LED 9W', 'LED bulb 9W', 'مصباح LED', 'ELE', null, 'PCS', 700, 1200, 1000, 15, false],
  ['ELE-005', 'Carte recharge 1000', 'Airtime card 1000', 'بطاقة شحن', 'ELE', null, 'PCS', 950, 1000, 980, 50, true, 'EXO'],
  ['PHA-001', 'Paracétamol 500mg (10 cp)', 'Paracetamol 500mg (10)', 'باراسيتامول', 'PHA', null, 'BOX', 150, 300, 250, 30, true, 'EXO'],
  ['PHA-002', 'Sel de réhydratation (SRO)', 'Oral rehydration salts', 'أملاح الإماهة', 'PHA', null, 'PCS', 100, 200, 175, 30, false, 'EXO'],
  ['PHA-003', 'Moustiquaire imprégnée', 'Treated mosquito net', 'ناموسية', 'PHA', null, 'PCS', 2500, 3500, 3200, 10, false, 'EXO'],
  ['PHA-004', 'Pansements (boîte de 20)', 'Plasters (20)', 'ضمادات', 'PHA', null, 'BOX', 300, 500, 450, 15, false, 'EXO'],
  ['BOU-001', 'Baguette', 'Baguette', 'خبز فرنسي', 'BOU', null, 'PCS', 100, 150, 125, 50, true, 'EXO'],
  ['BOU-002', 'Pain de mie', 'Sandwich bread', 'خبز توست', 'BOU', null, 'PCS', 500, 750, 700, 15, false, 'EXO'],
  ['BOU-003', 'Croissant', 'Croissant', 'كرواسون', 'BOU', null, 'PCS', 200, 350, 300, 20, true, 'EXO'],
  ['ENT-001', 'Lessive Omo 1kg', 'Omo detergent 1kg', 'مسحوق غسيل أومو', 'ENT', 'Omo', 'PCS', 1500, 2100, 1950, 15, true],
  ['ENT-002', 'Eau de Javel 1L', 'Bleach 1L', 'ماء جافيل', 'ENT', null, 'L', 400, 600, 550, 20, false],
  ['ENT-003', 'Liquide vaisselle 750ml', 'Dish soap 750ml', 'سائل غسيل الصحون', 'ENT', 'Madar', 'PCS', 700, 1000, 900, 15, false],
  ['ENT-004', 'Insecticide 400ml', 'Insecticide 400ml', 'مبيد حشرات', 'ENT', null, 'PCS', 1400, 2000, 1850, 10, false],
  ['ENT-005', 'Savon en barre 400g', 'Laundry soap bar 400g', 'صابون غسيل', 'ENT', 'Madar', 'PCS', 300, 450, 400, 40, false],
];

const CUSTOMERS = [
  { name: 'Moussa Adoum', phone: '+235 66 12 34 56', type: 'REGISTERED', creditLimit: 50000, address: 'Moursal, N’Djamena' },
  { name: 'Hawa Brahim', phone: '+235 66 23 45 67', type: 'REGISTERED', creditLimit: 30000, address: 'Chagoua, N’Djamena' },
  { name: 'Alimentation Al Nour', phone: '+235 99 34 56 78', type: 'BUSINESS', creditLimit: 500000, taxId: 'NIF-TD-0045821', address: 'Marché central, N’Djamena', email: 'alnour@exemple.td' },
  { name: 'Restaurant Le Sahel', phone: '+235 99 45 67 89', type: 'BUSINESS', creditLimit: 300000, taxId: 'NIF-TD-0078214', address: 'Klémat, N’Djamena', email: 'contact@lesahel.td' },
  { name: 'Djimadoum Ngarlem', phone: '+235 66 56 78 90', type: 'REGISTERED', creditLimit: 25000, address: 'Doumbeur, Moundou' },
  { name: 'Khadidja Saleh', phone: '+235 66 67 89 01', type: 'REGISTERED', creditLimit: 0, address: 'Farcha, N’Djamena' },
  { name: 'Pharmacie de la Paix', phone: '+235 99 78 90 12', type: 'BUSINESS', creditLimit: 400000, taxId: 'NIF-TD-0091377', address: 'Avenue Mobutu, N’Djamena' },
  { name: 'Abdelkerim Hassan', phone: '+235 66 89 01 23', type: 'REGISTERED', creditLimit: 40000, address: 'Amriguébé, N’Djamena' },
  { name: 'École Les Étoiles', phone: '+235 99 90 12 34', type: 'BUSINESS', creditLimit: 250000, taxId: 'NIF-TD-0103398', address: 'Gassi, N’Djamena' },
  { name: 'Nadège Mbaïgolmem', phone: '+235 66 01 23 45', type: 'REGISTERED', creditLimit: 20000, address: 'Quartier 15 ans, Moundou' },
] as const;

const SUPPLIERS = [
  { name: 'Brasseries du Tchad', company: 'Brasseries du Tchad SA', phone: '+235 22 52 10 10', email: 'commandes@bdt.td', paymentTerms: '30 jours', taxId: 'NIF-TD-0001023' },
  { name: 'Société Moderne des Abattoirs', company: 'SMA Distribution', phone: '+235 22 52 20 20', email: 'ventes@sma.td', paymentTerms: '15 jours', taxId: 'NIF-TD-0002045' },
  { name: 'Grands Moulins du Tchad', company: 'GMT SARL', phone: '+235 22 52 30 30', email: 'info@gmt.td', paymentTerms: '30 jours', taxId: 'NIF-TD-0003067' },
  { name: 'Cameroun Import Export', company: 'CIE Douala', phone: '+237 6 99 00 11 22', email: 'export@cie.cm', paymentTerms: 'Comptant', taxId: 'M0123456789' },
  { name: 'Sahel Distribution', company: 'Sahel Distribution SARL', phone: '+235 22 52 50 50', email: 'contact@saheldistri.td', paymentTerms: '45 jours', taxId: 'NIF-TD-0005089' },
];

const PAYMENT_METHODS = [
  { code: 'CASH', name: 'Espèces', type: 'CASH', provider: null, sortOrder: 1 },
  { code: 'CARD', name: 'Carte bancaire', type: 'CARD', provider: null, sortOrder: 2 },
  { code: 'AIRTEL_MONEY', name: 'Airtel Money', type: 'MOBILE_MONEY', provider: 'manual', sortOrder: 3 },
  { code: 'MOOV_MONEY', name: 'Moov Money', type: 'MOBILE_MONEY', provider: 'manual', sortOrder: 4 },
  { code: 'BANK_TRANSFER', name: 'Virement bancaire', type: 'BANK_TRANSFER', provider: null, sortOrder: 5 },
  { code: 'CREDIT', name: 'Crédit client', type: 'CREDIT', provider: null, sortOrder: 6 },
] as const;

const EXPENSE_CATEGORIES = [
  ['TRANSPORT', 'Transport'], ['ELECTRICITY', 'Électricité'], ['INTERNET', 'Internet'], ['SALARY_ADVANCE', 'Avance sur salaire'],
  ['MAINTENANCE', 'Maintenance'], ['OFFICE_SUPPLIES', 'Fournitures de bureau'], ['RENT', 'Loyer'], ['OTHER', 'Autre'],
];

export const DEFAULT_SETTINGS: Record<string, Prisma.InputJsonValue> = {
  company: {
    name: 'TECHNOVA POS',
    slogan: 'Smart Sales. Smart Stock. Smart Business.',
    legalName: 'TECHNOVA SARL',
    address: "Avenue Charles de Gaulle, N'Djamena, Tchad",
    phone: '+235 22 51 00 00',
    email: 'contact@technova.td',
    website: 'www.technova.td',
    taxId: 'NIF-TD-0099999',
    rccm: 'TD-NDJ-2026-B-0001',
    country: 'TD',
    logoUrl: null,
  },
  currency: { code: 'XAF', symbol: 'FCFA', decimals: 0, symbolPosition: 'after', thousandsSeparator: ',' },
  locale: { default: 'fr', available: ['fr', 'ar', 'en'], timezone: 'Africa/Ndjamena' },
  receipt: { footer: 'Merci pour votre confiance', showLogo: true, showTaxDetails: true, paperWidth: 80, showBarcode: true, autoPrint: false },
  invoice: { pattern: '{BRANCH}-{YEAR}-{SEQ}', padding: 6, resetYearly: true },
  pos: { allowNegativeStock: false, requireOpenRegister: true, largeDiscountPercent: 15, quickProductsLimit: 60, defaultPriceList: 'RETAIL' },
  notifications: { lowStock: true, largeDiscount: true, cashDiscrepancyThreshold: 1000 },
  printer: { type: 'BROWSER', escpos: { enabled: false, host: null, port: 9100 } },
  barcode: { internalPrefix: '20', format: 'EAN13' },
};

async function main() {
  console.log('🌱 Seeding TECHNOVA POS…');

  // Permissions
  for (const code of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code },
      update: { description: PERMISSIONS[code], module: code.split('.')[0] },
      create: { code, module: code.split('.')[0], description: PERMISSIONS[code] },
    });
  }
  const permissionIds = new Map((await prisma.permission.findMany()).map((p) => [p.code, p.id]));

  // Roles (system roles get their default grants re-applied)
  for (const def of DEFAULT_ROLES) {
    const role = await prisma.role.upsert({
      where: { code: def.code },
      update: { name: def.name, description: def.description, isSystem: true },
      create: { code: def.code, name: def.name, description: def.description, isSystem: true, maxDiscountPercent: dec(def.maxDiscountPercent) },
    });
    await prisma.rolePermission.createMany({
      data: def.permissions.map((c) => ({ roleId: role.id, permissionId: permissionIds.get(c)! })),
      skipDuplicates: true,
    });
  }
  const roles = new Map((await prisma.role.findMany()).map((r) => [r.code, r.id]));

  // Taxes
  const vat = await prisma.tax.upsert({ where: { code: 'TVA18' }, update: {}, create: { code: 'TVA18', name: 'TVA 18%', rate: dec(18) } });
  const exo = await prisma.tax.upsert({ where: { code: 'EXO' }, update: {}, create: { code: 'EXO', name: 'Exonéré', rate: dec(0) } });
  const taxes = new Map([['TVA18', vat.id], ['EXO', exo.id]]);

  // Branches + registers
  for (const b of BRANCHES) {
    const branch = await prisma.branch.upsert({ where: { code: b.code }, update: {}, create: { ...b, defaultTaxId: vat.id } });
    for (const name of ['Caisse 1', 'Caisse 2']) {
      await prisma.cashRegister.upsert({ where: { branchId_name: { branchId: branch.id, name } }, update: {}, create: { branchId: branch.id, name } });
    }
  }
  const branches = new Map((await prisma.branch.findMany()).map((b) => [b.code, b.id]));

  // Settings
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    const existing = await prisma.setting.findFirst({ where: { key, branchId: null } });
    if (!existing) await prisma.setting.create({ data: { key, value } });
  }

  // Users
  for (const u of DEV_USERS) {
    const user = await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: { username: u.username, email: u.email, fullName: u.fullName, passwordHash: await hash(u.password), defaultBranchId: branches.get(u.branches[0]) },
    });
    await prisma.userRole.createMany({ data: [{ userId: user.id, roleId: roles.get(u.role)! }], skipDuplicates: true });
    await prisma.userBranch.createMany({ data: u.branches.map((c) => ({ userId: user.id, branchId: branches.get(c)! })), skipDuplicates: true });
  }
  const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });

  // Units, categories, brands
  for (const u of UNITS) await prisma.unit.upsert({ where: { code: u.code }, update: {}, create: { ...u, isSystem: true } });
  const units = new Map((await prisma.unit.findMany()).map((u) => [u.code, u.id]));

  const categories = new Map<string, string>();
  for (const [i, c] of CATEGORIES.entries()) {
    let cat = await prisma.category.findFirst({ where: { name: c.name, parentId: null } });
    if (!cat) cat = await prisma.category.create({ data: { name: c.name, nameEn: c.nameEn, nameAr: c.nameAr, icon: c.icon, color: c.color, sortOrder: i } });
    categories.set(c.key, cat.id);
  }
  // Pharmacy & bakery items are VAT-exempt at category level
  await prisma.category.update({ where: { id: categories.get('PHA')! }, data: { taxId: exo.id } });

  for (const name of BRANDS) await prisma.brand.upsert({ where: { name }, update: {}, create: { name } });
  const brands = new Map((await prisma.brand.findMany()).map((b) => [b.name, b.id]));

  // Products + barcodes
  let seq = 1;
  for (const [sku, name, nameEn, nameAr, cat, brand, unit, cost, price, wholesale, minStock, quick, tax] of PRODUCTS) {
    const barcode = generateInternalEan13(seq++);
    const product = await prisma.product.upsert({
      where: { sku },
      update: {},
      create: {
        sku, name, nameEn, nameAr,
        categoryId: categories.get(cat), brandId: brand ? brands.get(brand) : null, unitId: units.get(unit),
        taxId: tax ? taxes.get(tax) : null,
        priceMode: 'INCLUSIVE',
        purchasePrice: dec(cost), sellingPrice: dec(price), wholesalePrice: wholesale ? dec(wholesale) : null,
        minStock: dec(minStock), maxStock: dec(minStock * 10), isQuick: quick,
        returnToStock: !['BOU', 'PHA', 'LAI'].includes(cat),
        description: `${name} — ${CATEGORIES.find((c) => c.key === cat)!.name}`,
      },
    });
    await prisma.productBarcode.upsert({ where: { barcode }, update: {}, create: { barcode, productId: product.id, isPrimary: true } });
  }

  // A product with variants (sizes) to exercise the variant selector
  const tshirt = await prisma.product.upsert({
    where: { sku: 'BOI-011' },
    update: {},
    create: {
      sku: 'BOI-011', name: 'Jus Pressea', nameEn: 'Pressea juice', nameAr: 'عصير بريسيا',
      categoryId: categories.get('BOI'), unitId: units.get('PCS'), priceMode: 'INCLUSIVE',
      purchasePrice: dec(350), sellingPrice: dec(600), wholesalePrice: dec(550), minStock: dec(12), maxStock: dec(120), isQuick: true,
      description: 'Jus de fruits — plusieurs formats',
    },
  });
  const variants: [string, string, number, number][] = [['BOI-011-25', '25 cl', 600, 350], ['BOI-011-100', '1 L', 1500, 900]];
  for (const [vsku, vname, vprice, vcost] of variants) {
    const v = await prisma.productVariant.upsert({
      where: { sku: vsku },
      update: {},
      create: { productId: tshirt.id, sku: vsku, name: vname, sellingPrice: dec(vprice), purchasePrice: dec(vcost) },
    });
    const barcode = generateInternalEan13(seq++);
    await prisma.productBarcode.upsert({ where: { barcode }, update: {}, create: { barcode, productId: tshirt.id, variantId: v.id, isPrimary: true } });
  }

  // Opening stock per branch (only for rows that do not exist yet) — always via a movement
  const allProducts = await prisma.product.findMany({ include: { variants: true } });
  const branchFactor: Record<string, number> = { NDJ: 1, NDS: 0.6, MOU: 0.4 };
  for (const [code, branchId] of branches) {
    for (const p of allProducts) {
      const targets = p.variants.length ? p.variants.map((v) => v.id) : [null];
      for (const variantId of targets) {
        const exists = await prisma.inventory.findFirst({ where: { branchId, productId: p.id, variantId } });
        if (exists) continue;
        // Deterministic but varied quantities; a few items deliberately low / out of stock
        const base = Number(p.minStock) * (2 + ((p.sku.charCodeAt(4) + p.sku.charCodeAt(6)) % 5));
        let qty = Math.round(base * (branchFactor[code] ?? 1));
        if (['ELE-002', 'COS-003'].includes(p.sku)) qty = Math.round(Number(p.minStock) / 2);
        if (p.sku === 'HYG-005' && code !== 'NDJ') qty = 0;
        await prisma.inventory.create({ data: { branchId, productId: p.id, variantId, quantity: dec(qty) } });
        await prisma.inventoryMovement.create({
          data: {
            branchId, productId: p.id, variantId, type: 'OPENING', quantity: dec(qty), balanceAfter: dec(qty),
            unitCost: p.purchasePrice, referenceType: 'OPENING', reference: 'Stock initial', userId: admin.id,
          },
        });
      }
    }
  }

  // Customers
  await prisma.customer.upsert({ where: { code: 'CLI-0000' }, update: {}, create: { code: 'CLI-0000', name: 'Client comptant', type: 'WALK_IN' } });
  for (const [i, c] of CUSTOMERS.entries()) {
    const code = `CLI-${String(i + 1).padStart(4, '0')}`;
    await prisma.customer.upsert({
      where: { code },
      update: {},
      create: { code, name: c.name, phone: c.phone, type: c.type, creditLimit: dec(c.creditLimit), address: c.address, email: 'email' in c ? c.email : null, taxId: 'taxId' in c ? c.taxId : null },
    });
  }

  // Suppliers
  for (const [i, s] of SUPPLIERS.entries()) {
    const code = `FRN-${String(i + 1).padStart(4, '0')}`;
    await prisma.supplier.upsert({ where: { code }, update: {}, create: { code, ...s, address: "N'Djamena" } });
  }

  // Payment methods & expense categories
  for (const m of PAYMENT_METHODS) await prisma.paymentMethod.upsert({ where: { code: m.code }, update: {}, create: { ...m } });
  for (const [code, name] of EXPENSE_CATEGORIES) await prisma.expenseCategory.upsert({ where: { code }, update: {}, create: { code, name } });

  const counts = {
    products: await prisma.product.count(),
    categories: await prisma.category.count(),
    customers: await prisma.customer.count(),
    suppliers: await prisma.supplier.count(),
    users: await prisma.user.count(),
  };
  console.log('✅ Seed complete', counts);
}

const isDirectRun = process.argv[1]?.replace(/\\/g, '/').endsWith('prisma/seed.ts');
if (isDirectRun) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

export { main as seed };
