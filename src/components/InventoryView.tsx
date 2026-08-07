/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Package, 
  Plus, 
  AlertTriangle, 
  TrendingDown, 
  Search, 
  FileText, 
  Activity,
  Sparkles,
  Utensils,
  Coffee,
  Layers,
  Percent,
  TrendingUp,
  Edit,
  Trash2
} from 'lucide-react';
import { Ingredient, MenuItem, CategoryType, IngredientRequirement } from '../types';
import RetroSelect from './RetroSelect';
import { formatNum, parseNum } from '../utils';
import { jsPDF } from 'jspdf';

const UNIT_OPTIONS = [
  { value: 'g', label: 'Gramo (g)' },
  { value: 'kg', label: 'Kilogramo (kg)' },
  { value: 'lb', label: 'Libra (lb)' },
  { value: 'oz', label: 'Onza (oz)' },
  { value: 'ml', label: 'Mililitro (ml)' },
  { value: 'L', label: 'Litro (L)' },
  { value: 'fl. oz', label: 'Onza fluida (fl. oz)' },
  { value: 'tz', label: 'Taza (tz)' },
  { value: 'cda', label: 'Cucharada (cda)' },
  { value: 'cdita', label: 'Cucharadita (cdita)' },
  { value: 'pz', label: 'Pieza (pza)' },
  { value: 'un', label: 'Unidad (un)' },
  { value: 'porción', label: 'Porción' },
];

interface InventoryViewProps {
  ingredients: Ingredient[];
  menuItems: MenuItem[];
  onRestockIngredient: (ingredientId: string, quantity: number, totalCost: number) => void;
  onAddIngredient: (ingredient: Omit<Ingredient, 'id'>) => void;
  onUpdateMinStock: (ingredientId: string, minStock: number) => void;
  onDeleteIngredient: (ingredientId: string) => void;
  onEditIngredient: (ingredient: Ingredient) => void;
  onRestockMenuItem: (id: string, quantity: number, totalCost: number) => void;
  onAddMenuItem: (item: Omit<MenuItem, 'id'>) => void;
  onEditMenuItem: (item: MenuItem) => void;
  onDeleteMenuItem: (id: string) => void;
}

export default function InventoryView({
  ingredients,
  menuItems = [],
  onRestockIngredient,
  onAddIngredient,
  onUpdateMinStock,
  onDeleteIngredient,
  onEditIngredient,
  onRestockMenuItem,
  onAddMenuItem,
  onEditMenuItem,
  onDeleteMenuItem,
}: InventoryViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<'materia_prima' | 'inv_comida' | 'inv_bebidas' | 'inv_combos'>('materia_prima');
  const [searchTerm, setSearchTerm] = useState('');
  
  // State for toast notifications
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  const showSuccessToast = (message: string) => {
    setToast({ message, type: 'success' });
    setTimeout(() => {
      setToast((curr) => curr?.message === message ? null : curr);
    }, 4000);
  };
  
  // State for confirming deletion via modal
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    type: 'ingredient' | 'product';
    id: string;
    name: string;
  } | null>(null);
  
  // Ingredients specific states
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);
  const [restockQty, setRestockQty] = useState('');

  // Restock menu item state
  const [restockingMenuItem, setRestockingMenuItem] = useState<MenuItem | null>(null);
  const [restockMenuQty, setRestockMenuQty] = useState('');

  const [isAddingIngredient, setIsAddingIngredient] = useState(false);
  const [newIngName, setNewIngName] = useState('');
  const [newIngStock, setNewIngStock] = useState('');
  const [newIngMin, setNewIngMin] = useState('');
  const [newIngUnit, setNewIngUnit] = useState('g');
  const [newIngCost, setNewIngCost] = useState('');

  // Editing existing ingredient states
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [editIngName, setEditIngName] = useState('');
  const [editIngStock, setEditIngStock] = useState('');
  const [editIngMin, setEditIngMin] = useState('');
  const [editIngUnit, setEditIngUnit] = useState('g');
  const [editIngCost, setEditIngCost] = useState('');

  // Ingredient threshold edit
  const [editingMinStockId, setEditingMinStockId] = useState<string | null>(null);
  const [editingMinStockVal, setEditingMinStockVal] = useState('');

  // Products specific states
  const [selectedProduct, setSelectedProduct] = useState<MenuItem | null>(null);

  // New states for creating/editing menu items
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [editingProductItem, setEditingProductItem] = useState<MenuItem | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodStock, setProdStock] = useState('');
  const [prodCat, setProdCat] = useState<CategoryType>('reposteria');

  const [ingCurrentPage, setIngCurrentPage] = useState(1);
  const [prodCurrentPage, setProdCurrentPage] = useState(1);

  React.useEffect(() => {
    setIngCurrentPage(1);
    setProdCurrentPage(1);
  }, [searchTerm, activeSubTab]);

  // Recipe formulation inside InventoryView
  const [recipeRequirements, setRecipeRequirements] = useState<IngredientRequirement[]>([]);
  const [selectedIngredientId, setSelectedIngredientId] = useState('');
  const [ingredientQuantityNeeded, setIngredientQuantityNeeded] = useState('');

  // Helper: Calculate ingredient availability for a given menu item
  const calculateMaxStockAvailable = (menuItem: MenuItem): number => {
    if (menuItem.category === 'combos') {
      if (!menuItem.ingredients || menuItem.ingredients.length === 0) return menuItem.stock !== undefined ? menuItem.stock : 99;
      let minQuantity = 99;
      let foundAnyComponent = false;
      menuItem.ingredients.forEach((req) => {
        const component = menuItems.find((m) => m.id === req.ingredientId);
        // Deleted component → skip, don't let ghost reference block the combo
        if (!component) return;
        foundAnyComponent = true;
        const componentAvailable = calculateMaxStockAvailable(component);
        const available = Math.floor(componentAvailable / req.quantity);
        if (available < minQuantity) {
          minQuantity = available;
        }
      });
      // All components deleted → treat as available
      return foundAnyComponent ? minQuantity : 99;
    }

    if (!menuItem.ingredients || menuItem.ingredients.length === 0) {
      return menuItem.stock !== undefined ? menuItem.stock : 99; // no raw material constraints, use direct stock
    }
    
    let minQuantity = 99;
    let foundAnyIngredient = false;
    
    menuItem.ingredients.forEach((req) => {
      const ingredient = ingredients.find((ing) => ing.id === req.ingredientId);
      // Deleted ingredient → skip, don't block on ghost references
      if (!ingredient) return;
      foundAnyIngredient = true;
      const available = Math.floor(ingredient.stock / req.quantity);
      if (available < minQuantity) {
        minQuantity = available;
      }
    });
    
    // All ingredients deleted → treat as freely available
    return foundAnyIngredient ? minQuantity : 99;
  };

  // Helper: Calculate total recipe cost
  const calculateRecipeCost = (menuItem: MenuItem): number => {
    if (!menuItem.ingredients) return 0;
    if (menuItem.category === 'combos') {
      return menuItem.ingredients.reduce((acc, req) => {
        const component = menuItems.find((m) => m.id === req.ingredientId);
        if (!component) return acc;
        const componentCost = component.cost || calculateRecipeCost(component);
        return acc + (req.quantity * componentCost);
      }, 0);
    }
    return menuItem.ingredients.reduce((acc, req) => {
      const ing = ingredients.find((i) => i.id === req.ingredientId);
      return acc + (req.quantity * (ing?.costPerUnit || 0));
    }, 0);
  };

  // Filter lists based on selected view
  const filteredIngredients = ingredients.filter((ing) =>
    ing.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredProducts = menuItems.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.description.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (activeSubTab === 'inv_comida') {
      return item.category === 'reposteria' || item.category === 'alimentos';
    }
    if (activeSubTab === 'inv_bebidas') {
      return (
        item.category === 'cafes' ||
        item.category === 'bebidas_frias' ||
        item.category === 'cafe_caliente' ||
        item.category === 'tes_infusiones' ||
        item.category === 'bebidas_frias_frappes' ||
        item.category === 'zumos_jugos' ||
        item.category === 'bebidas_envasadas' ||
        item.category === 'bebidas_alcoholicas'
      );
    }
    if (activeSubTab === 'inv_combos') {
      return item.category === 'combos';
    }
    return false;
  });

  const lowStockCount = ingredients.filter((ing) => ing.stock > 0 && ing.stock <= 10).length;
  const outOfStockCount = ingredients.filter((ing) => ing.stock <= 0).length;

  const handleRestockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIngredient) return;
    
    const qty = parseNum(restockQty);
    if (isNaN(qty) || qty <= 0) return;

    const totalCost = qty * selectedIngredient.costPerUnit;
    onRestockIngredient(selectedIngredient.id, qty, totalCost);
    showSuccessToast(`¡Reabastecimiento de ${selectedIngredient.name} registrado con éxito!`);
    
    // Reset
    setRestockQty('');
    setSelectedIngredient(null);
  };

  const [restockMenuTotalCost, setRestockMenuTotalCost] = useState('');

  const handleRestockMenuSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockingMenuItem || !restockMenuQty) return;

    const qty = parseNum(restockMenuQty);
    const totalCost = parseNum(restockMenuTotalCost) || 0;
    
    if (isNaN(qty) || qty <= 0) {
      alert("Por favor ingrese una cantidad válida y mayor a 0.");
      return;
    }

    onRestockMenuItem(restockingMenuItem.id, qty, totalCost);
    
    showSuccessToast(`¡Reabasteciste ${qty} unidades de ${restockingMenuItem.name}!`);
    setRestockingMenuItem(null);
    setRestockMenuQty('');
    setRestockMenuTotalCost('');
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const businessName = localStorage.getItem('caf_business_name') || 'moccapricho';
    
    // Title mapping
    let sectionTitle = '';
    if (activeSubTab === 'materia_prima') sectionTitle = 'MATERIA PRIMA / INSUMOS';
    else if (activeSubTab === 'inv_bebidas') sectionTitle = 'BEBIDAS (FRÍAS & CALIENTES)';
    else if (activeSubTab === 'inv_comida') sectionTitle = 'ALIMENTOS / REPOSTERÍA';
    else if (activeSubTab === 'inv_combos') sectionTitle = 'COMBOS ESPECIALES';

    const dateStr = new Date().toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    let y = 48; // starting vertical position below header
    let page = 1;

    const drawHeader = (pageNum: number) => {
      // Elegant retro header box
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(1.0);
      doc.setFillColor(245, 245, 244); // light stone-100
      doc.rect(15, 12, 180, 24, 'F');
      doc.rect(15, 12, 180, 24, 'D');

      // Title & Brand
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(0, 0, 0);
      doc.text(`${businessName.toUpperCase()} - RUC: 1725403883001`, 19, 21);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      doc.text(`REPORTE: ${sectionTitle}`, 19, 26);
      doc.text(`EMITIDO: ${dateStr}`, 19, 31);

      // Retro accent badge on the right
      doc.setFillColor(254, 240, 138); // yellow-100
      doc.rect(132, 17, 58, 14, 'F');
      doc.rect(132, 17, 58, 14, 'D');
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      doc.text('CONTROL DE INVENTARIO', 134, 22);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`PÁGINA ${pageNum}`, 134, 27);
    };

    const drawFooter = (pageNum: number) => {
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(`${businessName.toUpperCase()} - Sistema POS & Control de Inventario`, 15, 287);
      doc.text(`Pág. ${pageNum}`, 195, 287, { align: 'right' });
    };

    // Initial header and footer
    drawHeader(page);
    drawFooter(page);

    // Let's print section-specific totals summary
    if (activeSubTab === 'materia_prima') {
      const totalItems = filteredIngredients.length;
      const criticalItems = filteredIngredients.filter(ing => ing.stock <= ing.minStock).length;
      const totalCostValue = filteredIngredients.reduce((acc, ing) => acc + (ing.stock * ing.costPerUnit), 0);

      doc.setFillColor(243, 244, 246); // gray-100
      doc.rect(15, 40, 180, 16, 'F');
      doc.rect(15, 40, 180, 16, 'D');

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('RESUMEN DE SECCIÓN:', 19, 46);
      
      doc.setFont('Helvetica', 'normal');
      doc.text(`Total Insumos: ${totalItems}`, 19, 51);
      doc.text(`Stock Crítico: ${criticalItems} items`, 75, 51);
      doc.text(`Valor Estimado de Existencias: $${totalCostValue.toFixed(2)} USD`, 130, 51);

      y = 66;

      // Table Headers
      doc.setFillColor(236, 72, 153); // pink-500
      doc.rect(15, y, 180, 8, 'F');
      doc.rect(15, y, 180, 8, 'D');

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text('INSUMO / MATERIAL', 18, y + 5.5);
      doc.text('NIVEL CRÍTICO', 73, y + 5.5);
      doc.text('EXISTENCIAS', 98, y + 5.5);
      doc.text('COSTO UNIT.', 123, y + 5.5);
      doc.text('VALOR TOTAL', 148, y + 5.5);
      doc.text('ESTADO', 173, y + 5.5);

      y += 8;

      // Draw rows
      let rowsOnCurrentPage = 0;
      filteredIngredients.forEach((ing, index) => {
        if (rowsOnCurrentPage >= 10) {
          doc.addPage();
          page++;
          drawHeader(page);
          drawFooter(page);
          y = 48;
          rowsOnCurrentPage = 0;

          // Redraw table header
          doc.setFillColor(236, 72, 153);
          doc.rect(15, y, 180, 8, 'F');
          doc.rect(15, y, 180, 8, 'D');
          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(255, 255, 255);
          doc.text('INSUMO / MATERIAL', 18, y + 5.5);
          doc.text('NIVEL CRÍTICO', 73, y + 5.5);
          doc.text('EXISTENCIAS', 98, y + 5.5);
          doc.text('COSTO UNIT.', 123, y + 5.5);
          doc.text('VALOR TOTAL', 148, y + 5.5);
          doc.text('ESTADO', 173, y + 5.5);

          y += 8;
        }

        // Alternating backgrounds
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.3);
        if (index % 2 === 1) {
          doc.setFillColor(250, 250, 249); // Warm stone
          doc.rect(15, y, 180, 8, 'F');
        }
        doc.rect(15, y, 180, 8, 'D');

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0);
        doc.text(ing.name.toUpperCase(), 18, y + 5.5);

        doc.setFont('Helvetica', 'normal');
        doc.text(`${ing.minStock.toLocaleString('es-ES')} ${ing.unit}`, 73, y + 5.5);
        
        const isCritical = ing.stock <= ing.minStock;
        if (isCritical) {
          doc.setFont('Helvetica', 'bold');
          doc.setTextColor(185, 28, 28); // red-700
        } else {
          doc.setTextColor(0, 0, 0);
        }
        doc.text(`${ing.stock.toLocaleString('es-ES')} ${ing.unit}`, 98, y + 5.5);
        doc.setTextColor(0, 0, 0);
        doc.setFont('Helvetica', 'normal');

        doc.text(`$${ing.costPerUnit.toFixed(2)}`, 123, y + 5.5);
        doc.text(`$${(ing.stock * ing.costPerUnit).toFixed(2)}`, 148, y + 5.5);

        if (isCritical) {
          doc.setFillColor(254, 202, 202); // red-200
          doc.rect(171, y + 1.5, 18, 5, 'F');
          doc.rect(171, y + 1.5, 18, 5, 'D');
          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(153, 27, 27);
          doc.text('BAJO STOCK', 180, y + 5, { align: 'center' });
        } else {
          doc.setFillColor(209, 250, 229); // green-100
          doc.rect(171, y + 1.5, 18, 5, 'F');
          doc.rect(171, y + 1.5, 18, 5, 'D');
          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(6, 95, 70);
          doc.text('OK', 180, y + 5, { align: 'center' });
        }

        y += 8;
        rowsOnCurrentPage++;
      });

    } else {
      const totalItems = filteredProducts.length;
      const withRecipe = filteredProducts.filter(item => item.ingredients && item.ingredients.length > 0).length;

      doc.setFillColor(243, 244, 246);
      doc.rect(15, 40, 180, 16, 'F');
      doc.rect(15, 40, 180, 16, 'D');

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('RESUMEN DE SECCIÓN:', 19, 46);
      
      doc.setFont('Helvetica', 'normal');
      doc.text(`Total Productos: ${totalItems}`, 19, 51);
      doc.text(`Recetas Vinculadas: ${withRecipe} productos`, 75, 51);
      doc.text(`Categoría Activa: ${sectionTitle}`, 130, 51);

      y = 66;

      if (activeSubTab === 'inv_combos') {
        doc.setFillColor(249, 115, 22); // orange-500
        doc.rect(15, y, 180, 8, 'F');
        doc.rect(15, y, 180, 8, 'D');

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text('COMBO ESPECIAL', 18, y + 5.5);
        doc.text('COMPOSICIÓN / PRODUCTOS', 78, y + 5.5);
        doc.text('PRECIO VENTA', 143, y + 5.5);
        doc.text('COSTO ESTIMADO', 168, y + 5.5);
        doc.text('DISPONIBILIDAD', 192, y + 5.5, { align: 'right' });

        y += 8;

        let rowsOnCurrentPage = 0;
        filteredProducts.forEach((item, index) => {
          if (rowsOnCurrentPage >= 10) {
            doc.addPage();
            page++;
            drawHeader(page);
            drawFooter(page);
            y = 48;
            rowsOnCurrentPage = 0;

            doc.setFillColor(249, 115, 22);
            doc.rect(15, y, 180, 8, 'F');
            doc.rect(15, y, 180, 8, 'D');
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(255, 255, 255);
            doc.text('COMBO ESPECIAL', 18, y + 5.5);
            doc.text('COMPOSICIÓN / PRODUCTOS', 78, y + 5.5);
            doc.text('PRECIO VENTA', 143, y + 5.5);
            doc.text('COSTO ESTIMADO', 168, y + 5.5);
            doc.text('DISPONIBILIDAD', 192, y + 5.5, { align: 'right' });

            y += 8;
          }

          if (index % 2 === 1) {
            doc.setFillColor(250, 250, 249);
            doc.rect(15, y, 180, 8, 'F');
          }
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.3);
          doc.rect(15, y, 180, 8, 'D');

          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(0, 0, 0);
          doc.text(item.name.toUpperCase(), 18, y + 5.5);

          let compStr = '';
          if (item.ingredients && item.ingredients.length > 0) {
            compStr = item.ingredients.map(req => {
              const child = menuItems.find(m => m.id === req.ingredientId);
              return `${req.quantity}x ${child?.name || req.ingredientId}`;
            }).join(', ');
          } else {
            compStr = 'Sin componentes vinculados';
          }
          if (compStr.length > 40) compStr = compStr.substring(0, 37) + '...';

          doc.setFont('Helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.text(compStr.toUpperCase(), 78, y + 5.5);

          doc.setFontSize(8);
          doc.text(`$${item.price.toFixed(2)}`, 143, y + 5.5);
          doc.text(`$${calculateRecipeCost(item).toFixed(2)}`, 168, y + 5.5);

          const available = calculateMaxStockAvailable(item);
          if (available === 0) {
            doc.setFont('Helvetica', 'bold');
            doc.setTextColor(185, 28, 28);
            doc.text('SIN INGREDIENTES', 192, y + 5.5, { align: 'right' });
          } else {
            doc.setFont('Helvetica', 'bold');
            doc.setTextColor(6, 95, 70);
            doc.text(`${available} combos`, 192, y + 5.5, { align: 'right' });
          }
          doc.setTextColor(0, 0, 0);

          y += 8;
          rowsOnCurrentPage++;
        });

      } else {
        doc.setFillColor(6, 182, 212); // cyan-500
        doc.rect(15, y, 180, 8, 'F');
        doc.rect(15, y, 180, 8, 'D');

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text('PRODUCTO', 18, y + 5.5);
        doc.text('CATEGORÍA', 78, y + 5.5);
        doc.text('PRECIO VENTA', 113, y + 5.5);
        doc.text('COSTO RECETA', 138, y + 5.5);
        doc.text('DISPONIBILIDAD TOTAL', 163, y + 5.5);

        y += 8;

        let rowsOnCurrentPage = 0;
        filteredProducts.forEach((item, index) => {
          if (rowsOnCurrentPage >= 10) {
            doc.addPage();
            page++;
            drawHeader(page);
            drawFooter(page);
            y = 48;
            rowsOnCurrentPage = 0;

            doc.setFillColor(6, 182, 212);
            doc.rect(15, y, 180, 8, 'F');
            doc.rect(15, y, 180, 8, 'D');
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(255, 255, 255);
            doc.text('PRODUCTO', 18, y + 5.5);
            doc.text('CATEGORÍA', 78, y + 5.5);
            doc.text('PRECIO VENTA', 113, y + 5.5);
            doc.text('COSTO RECETA', 138, y + 5.5);
            doc.text('DISPONIBILIDAD TOTAL', 163, y + 5.5);

            y += 8;
          }

          if (index % 2 === 1) {
            doc.setFillColor(250, 250, 249);
            doc.rect(15, y, 180, 8, 'F');
          }
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.3);
          doc.rect(15, y, 180, 8, 'D');

          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(0, 0, 0);
          doc.text(item.name.toUpperCase(), 18, y + 5.5);

          doc.setFont('Helvetica', 'normal');
           let catLabel = '';
          if (item.category === 'cafes' || item.category === 'cafe_caliente') catLabel = '☕ CAFÉ CALIENTE';
          else if (item.category === 'tes_infusiones') catLabel = '🍵 TÉ / INFUSIÓN';
          else if (item.category === 'bebidas_frias' || item.category === 'bebidas_frias_frappes') catLabel = '🥤 BEBIDA FRÍA';
          else if (item.category === 'zumos_jugos') catLabel = '🍹 JUGO NATURAL';
          else if (item.category === 'bebidas_envasadas') catLabel = '🧴 BEBIDA ENVASADA';
          else if (item.category === 'bebidas_alcoholicas') catLabel = '🍺 BEBIDA ALCOHÓLICA';
          else if (item.category === 'reposteria') catLabel = '🍰 REPOSTERÍA';
          else if (item.category === 'alimentos') catLabel = '🥪 ALIMENTO';
          else catLabel = item.category.toUpperCase();

          doc.text(catLabel, 78, y + 5.5);
          doc.text(`$${item.price.toFixed(2)}`, 113, y + 5.5);
          
          const recCost = calculateRecipeCost(item);
          doc.text(recCost > 0 ? `$${recCost.toFixed(2)}` : 'Sin receta', 138, y + 5.5);

          const available = calculateMaxStockAvailable(item);
          if (available === 0) {
            doc.setFont('Helvetica', 'bold');
            doc.setTextColor(185, 28, 28);
            doc.text('AGOTADO (0)', 163, y + 5.5);
          } else if (available === 99) {
            doc.setFont('Helvetica', 'normal');
            doc.setTextColor(120, 120, 120);
            doc.text('VENTA LIBRE', 163, y + 5.5);
          } else {
            doc.setFont('Helvetica', 'bold');
            doc.setTextColor(6, 95, 70);
            doc.text(`${available} pzs disp.`, 163, y + 5.5);
          }
          doc.setTextColor(0, 0, 0);

          y += 8;
          rowsOnCurrentPage++;
        });
      }
    }

    const filename = `inventario_${activeSubTab}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
  };

  const handleAddIngredientSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIngName) return;

    const stock = parseNum(newIngStock) || 0;
    const cost = parseNum(newIngCost) || 0;

    onAddIngredient({
      name: newIngName,
      stock,
      minStock: 10,
      unit: newIngUnit,
      costPerUnit: cost
    });

    showSuccessToast("¡Materia prima registrada correctamente!");

    // Reset
    setIsAddingIngredient(false);
    setNewIngName('');
    setNewIngStock('');
    setNewIngMin('');
    setNewIngUnit('g');
    setNewIngCost('');
  };

  const handleEditClick = (ing: Ingredient) => {
    setEditingIngredient(ing);
    setEditIngName(ing.name);
    setEditIngStock(ing.stock.toString());
    setEditIngMin(ing.minStock ? ing.minStock.toString() : '10');
    setEditIngUnit(ing.unit);
    setEditIngCost(ing.costPerUnit.toString());

    // close other drawers to avoid conflict
    setIsAddingIngredient(false);
    setSelectedIngredient(null);
  };

  const handleEditIngredientSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingIngredient) return;

    const stock = parseNum(editIngStock) || 0;
    const cost = parseNum(editIngCost) || 0;

    onEditIngredient({
      id: editingIngredient.id,
      name: editIngName,
      stock,
      minStock: 10,
      unit: editIngUnit,
      costPerUnit: cost
    });

    // Reset
    setEditingIngredient(null);
    setEditIngName('');
    setEditIngStock('');
    setEditIngMin('');
    setEditIngUnit('g');
    setEditIngCost('');

    showSuccessToast("¡Materia prima actualizada correctamente!");
  };

  const handleStartEditMinStock = (ing: Ingredient) => {
    setEditingMinStockId(ing.id);
    setEditingMinStockVal(ing.minStock.toString());
  };

  const handleSaveMinStock = (id: string) => {
    const val = parseNum(editingMinStockVal);
    if (!isNaN(val) && val >= 0) {
      onUpdateMinStock(id, val);
    }
    setEditingMinStockId(null);
  };

  // Product-recipe helpers
  const handleProductAddRequirement = () => {
    if (!selectedIngredientId || !ingredientQuantityNeeded) return;
    const qty = parseNum(ingredientQuantityNeeded);
    if (isNaN(qty) || qty <= 0) return;

    const exists = recipeRequirements.some(r => r.ingredientId === selectedIngredientId);
    if (exists) {
      setRecipeRequirements(recipeRequirements.map(r => 
        r.ingredientId === selectedIngredientId ? { ...r, quantity: r.quantity + qty } : r
      ));
    } else {
      setRecipeRequirements([...recipeRequirements, { ingredientId: selectedIngredientId, quantity: qty }]);
    }

    setIngredientQuantityNeeded('');
    setSelectedIngredientId('');
  };

  const handleProductRemoveRequirement = (idx: number) => {
    setRecipeRequirements(recipeRequirements.filter((_, i) => i !== idx));
  };

  const handleAddProductClick = () => {
    setIsAddingProduct(true);
    setEditingProductItem(null);
    setSelectedProduct(null);
    setProdName('');
    setProdPrice('');
    setProdStock('');
    // Pre-set category based on subtab
    if (activeSubTab === 'inv_comida') {
      setProdCat('alimentos');
    } else if (activeSubTab === 'inv_bebidas') {
      setProdCat('cafe_caliente');
    } else {
      setProdCat('combos');
    }
    setRecipeRequirements([]);
    setSelectedIngredientId('');
    setIngredientQuantityNeeded('');

    // close other drawers to avoid conflict
    setSelectedIngredient(null);
    setRestockQty('');
  };

  const handleEditProductClick = (item: MenuItem) => {
    setEditingProductItem(item);
    setIsAddingProduct(false);
    setSelectedProduct(null);
    setProdName(item.name);
    setProdPrice(item.price.toString());
    setProdStock(item.stock !== undefined ? item.stock.toString() : '');
    setProdCat(item.category);
    setRecipeRequirements(item.ingredients || []);
    setSelectedIngredientId('');
    setIngredientQuantityNeeded('');

    // close other drawers
    setSelectedIngredient(null);
    setRestockQty('');
  };

  const handleProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName || !prodPrice) return;

    if (activeSubTab === 'inv_bebidas' && recipeRequirements.length === 0) {
      if (prodStock.trim() === '') {
        alert('Para bebidas de venta directa (sin receta), el campo "Stock Directo" es obligatorio.');
        return;
      }
    }

    const price = parseNum(prodPrice) || 0;
    const cost = recipeRequirements.reduce((acc, req) => {
      const ing = ingredients.find(i => i.id === req.ingredientId);
      return acc + (req.quantity * (ing?.costPerUnit || 0));
    }, 0);

    let stock: number | undefined = undefined;
    if (prodStock.trim() !== '') {
      const parsed = parseNum(prodStock);
      if (!isNaN(parsed)) stock = parsed;
    }

    if (editingProductItem) {
      onEditMenuItem({
        id: editingProductItem.id,
        name: prodName,
        description: '',
        price,
        cost,
        category: prodCat,
        status: editingProductItem.status,
        ingredients: recipeRequirements,
        stock
      });

      // Categorized edit success message
      let msg = "¡Producto actualizado correctamente!";
      if (activeSubTab === 'inv_comida') {
        msg = "¡Comida actualizada correctamente!";
      } else if (activeSubTab === 'inv_bebidas') {
        msg = "¡Bebida actualizada correctamente!";
      } else if (activeSubTab === 'inv_combos') {
        msg = "¡Combo actualizado correctamente!";
      }
      showSuccessToast(msg);
    } else {
      onAddMenuItem({
        name: prodName,
        description: '',
        price,
        cost,
        category: prodCat,
        status: 'active',
        ingredients: recipeRequirements,
        stock
      });

      // Categorized create success message
      let msg = "¡Producto registrado correctamente!";
      if (activeSubTab === 'inv_comida') {
        msg = "¡Comida registrada correctamente!";
      } else if (activeSubTab === 'inv_bebidas') {
        msg = "¡Bebida registrada correctamente!";
      } else if (activeSubTab === 'inv_combos') {
        msg = "¡Combo registrado correctamente!";
      }
      showSuccessToast(msg);
    }

    // Reset
    setIsAddingProduct(false);
    setEditingProductItem(null);
    setSelectedProduct(null);
    setProdName('');
    setProdPrice('');
    setProdStock('');
    setRecipeRequirements([]);
    setSelectedIngredientId('');
    setIngredientQuantityNeeded('');
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation system for Inventory Sections */}
      <div className="flex flex-wrap gap-2 md:gap-3 border-b-3 border-black pb-4 mb-1">
        <button
          onClick={() => { setActiveSubTab('materia_prima'); setSearchTerm(''); }}
          className={`flex items-center gap-2 px-4 py-2.5 border-3 border-black rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-y-0.5 ${
            activeSubTab === 'materia_prima'
              ? 'bg-yellow-300 text-black translate-x-[-1px] translate-y-[-1px] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'
              : 'bg-white hover:bg-zinc-100 text-black'
          }`}
        >
          <Package className="w-4 h-4 stroke-[2.5]" />
          🫘 MATERIA PRIMA
        </button>

        <button
          onClick={() => { setActiveSubTab('inv_comida'); setSearchTerm(''); setSelectedProduct(null); }}
          className={`flex items-center gap-2 px-4 py-2.5 border-3 border-black rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-y-0.5 ${
            activeSubTab === 'inv_comida'
              ? 'bg-pink-300 text-black translate-x-[-1px] translate-y-[-1px] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'
              : 'bg-white hover:bg-zinc-100 text-black'
          }`}
        >
          <Utensils className="w-4 h-4 stroke-[2.5]" />
          🍰 INV COMIDA
        </button>

        <button
          onClick={() => { setActiveSubTab('inv_bebidas'); setSearchTerm(''); setSelectedProduct(null); }}
          className={`flex items-center gap-2 px-4 py-2.5 border-3 border-black rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-y-0.5 ${
            activeSubTab === 'inv_bebidas'
              ? 'bg-cyan-300 text-black translate-x-[-1px] translate-y-[-1px] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'
              : 'bg-white hover:bg-zinc-100 text-black'
          }`}
        >
          <Coffee className="w-4 h-4 stroke-[2.5]" />
          ☕ BEBIDAS
        </button>

        <button
          onClick={() => { setActiveSubTab('inv_combos'); setSearchTerm(''); setSelectedProduct(null); }}
          className={`flex items-center gap-2 px-4 py-2.5 border-3 border-black rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-y-0.5 ${
            activeSubTab === 'inv_combos'
              ? 'bg-orange-300 text-black translate-x-[-1px] translate-y-[-1px] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'
              : 'bg-white hover:bg-zinc-100 text-black'
          }`}
        >
          <Layers className="w-4 h-4 stroke-[2.5]" />
          🍔 INV COMBOS
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" id="inventory-container">
        
        {/* Left panel: Selected inventory section */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* MATERIA PRIMA (RAW INGREDIENTS) VIEW */}
          {activeSubTab === 'materia_prima' && (
            <>
              {/* KPI Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5" id="inventory-kpis">
                <div className="bg-[#d9f99d] border-3 border-black rounded-xl p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-black font-black font-retro-mono">INSUMOS REGISTRADOS</p>
                    <h3 className="text-3xl font-retro-heavy text-black mt-1">{ingredients.length}</h3>
                  </div>
                  <div className="w-11 h-11 rounded-lg bg-white border-2 border-black flex items-center justify-center text-black">
                    <Package className="w-5 h-5 stroke-[2.5]" />
                  </div>
                </div>

                <div className={`border-3 border-black rounded-xl p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center justify-between ${
                  lowStockCount > 0 ? 'bg-amber-300' : 'bg-purple-200'
                }`}>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-black font-black font-retro-mono">STOCK BAJO (≤ 10)</p>
                    <h3 className="text-3xl font-retro-heavy text-black mt-1">
                      {lowStockCount}
                    </h3>
                  </div>
                  <div className={`w-11 h-11 rounded-lg flex items-center justify-center border-2 border-black bg-white text-black`}>
                    <AlertTriangle className="w-5 h-5 stroke-[2.5]" />
                  </div>
                </div>

                <div className={`border-3 border-black rounded-xl p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center justify-between ${
                  outOfStockCount > 0 ? 'bg-rose-300' : 'bg-sky-200'
                }`}>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-black font-black font-retro-mono">AGOTADOS (STOCK 0)</p>
                    <h3 className="text-3xl font-retro-heavy text-black mt-1">
                      {outOfStockCount}
                    </h3>
                  </div>
                  <div className="w-11 h-11 rounded-lg bg-white text-black border-2 border-black flex items-center justify-center">
                    <TrendingDown className="w-5 h-5 stroke-[2.5]" />
                  </div>
                </div>
              </div>

              {/* Ingredients Control Panel */}
              <div className="bg-white border-4 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden" id="ingredients-panel">
                <div className="border-b-4 border-black p-5 bg-pink-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-black">
                  <div>
                    <h3 className="font-retro-heavy text-base uppercase">📊 CATÁLOGO DE EXISTENCIAS</h3>
                    <p className="text-xs font-bold uppercase text-black/80 mt-0.5">Control de gramajes y costo analítico</p>
                  </div>
                  
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                      onClick={handleDownloadPDF}
                      className="flex items-center gap-1.5 bg-white hover:bg-zinc-100 text-black border-3 border-black rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-y-0.5"
                      title="Descargar PDF"
                    >
                      <FileText className="w-4 h-4 stroke-[2.5]" />
                      PDF
                    </button>
                    <button
                      onClick={() => {
                        setIsAddingIngredient(true);
                        setSelectedIngredient(null);
                        setEditingIngredient(null);
                        setNewIngName('');
                        setNewIngStock('');
                        setNewIngMin('');
                        setNewIngUnit('g');
                        setNewIngCost('');
                      }}
                      className="flex items-center gap-1.5 bg-yellow-300 hover:bg-yellow-200 text-black border-3 border-black rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-y-0.5"
                    >
                      <Plus className="w-4 h-4 stroke-[3]" />
                      NUEVO INSUMO
                    </button>
                  </div>
                </div>

                {/* Search bar inside list */}
                <div className="p-4 border-b-3 border-black bg-white">
                  <div className="relative">
                    <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-black stroke-[2.5]" />
                    <input
                      type="text"
                      placeholder="Escribe para buscar (ej. leche, café, vasos, canela)..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border-2 border-black bg-[#fafaf9] rounded-lg text-xs font-extrabold focus:outline-none focus:bg-cyan-50 font-retro-mono text-black"
                    />
                  </div>
                </div>

                {/* Ingredients Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-yellow-100 text-[10px] font-black text-black uppercase tracking-widest border-b-3 border-black">
                        <th className="py-3 px-5">Insumo</th>
                        <th className="py-3 px-5 text-center">Medida</th>
                        <th className="py-3 px-5 text-right">Existencias</th>
                        <th className="py-3 px-5 text-right">Costo Unitario</th>
                        <th className="py-3 px-5 text-center">Estado (Aviso ≤ 10)</th>
                        <th className="py-3 px-5 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-2 divide-dashed divide-black/15 text-xs text-black font-bold">
                      {(() => {
                        const ITEMS_PER_PAGE = 10;
                        const paginatedIngredients = filteredIngredients.slice(
                          (ingCurrentPage - 1) * ITEMS_PER_PAGE,
                          ingCurrentPage * ITEMS_PER_PAGE
                        );

                        return (
                          <>
                            {paginatedIngredients.map((ing) => {
                              const isZero = ing.stock <= 0;
                              const isLow = ing.stock > 0 && ing.stock <= 10;
                              return (
                                <tr key={ing.id} className={`hover:bg-cyan-50/50 transition-colors ${isZero ? 'bg-red-100/60' : isLow ? 'bg-amber-50' : ''}`}>
                                  <td className="py-3.5 px-5">
                                    <p className="font-black text-black text-sm uppercase">{ing.name}</p>
                                    <span className="text-[10px] text-zinc-500 font-retro-mono font-bold uppercase">SKU: {ing.id}</span>
                                  </td>
                                  
                                  <td className="py-3.5 px-5 text-center">
                                    <span className="font-retro-mono font-black text-black uppercase bg-zinc-100 px-2 py-0.5 border border-black rounded">{ing.unit}</span>
                                  </td>

                                  <td className="py-3.5 px-5 text-right font-retro-mono font-black text-black text-sm">
                                    {ing.stock.toLocaleString('es-ES')} {ing.unit}
                                  </td>

                                  <td className="py-3.5 px-5 text-right font-retro-mono text-zinc-600 font-bold">
                                    ${formatNum(ing.costPerUnit, 3)}/{ing.unit}
                                  </td>

                                  <td className="py-3.5 px-5 text-center">
                                    {isZero ? (
                                      <span className="inline-flex items-center gap-1 retro-tag bg-red-500 text-white border border-black rounded px-1.5 py-0.5 text-[9px] font-black uppercase">
                                        🚫 Agotado (0)
                                      </span>
                                    ) : isLow ? (
                                      <span className="inline-flex items-center gap-1 retro-tag bg-amber-300 text-black border border-black rounded px-1.5 py-0.5 text-[9px] font-black uppercase">
                                        ⚠️ Stock Bajo (≤ 10)
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 retro-badge-lime text-black bg-lime-300 border border-black rounded px-1.5 py-0.5 text-[9px] font-black uppercase">
                                        ✅ Óptimo
                                      </span>
                                    )}
                                  </td>

                                  <td className="py-3.5 px-5 text-center">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button
                                        onClick={() => {
                                          setSelectedIngredient(ing);
                                          setRestockQty('');
                                          setIsAddingIngredient(false);
                                          setEditingIngredient(null);
                                        }}
                                        className="bg-yellow-300 border-2 border-black hover:bg-yellow-400 text-black px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
                                        title="Registrar Compra"
                                      >
                                        Comprar
                                      </button>
                                      <button
                                        onClick={() => handleEditClick(ing)}
                                        className="bg-cyan-200 border-2 border-black hover:bg-cyan-300 text-black p-1 rounded transition-all cursor-pointer shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
                                        title="Editar Insumo"
                                      >
                                        <Edit className="w-3.5 h-3.5 stroke-[2.5]" />
                                      </button>
                                      <button
                                        onClick={() => {
                                          setDeleteModal({
                                            isOpen: true,
                                            type: 'ingredient',
                                            id: ing.id,
                                            name: ing.name
                                          });
                                        }}
                                        className="bg-red-300 border-2 border-black hover:bg-red-400 text-black p-1 rounded transition-all cursor-pointer shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
                                        title="Eliminar Insumo"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 stroke-[2.5]" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}

                            {filteredIngredients.length === 0 && (
                              <tr>
                                <td colSpan={6} className="py-10 text-center text-zinc-500 font-black uppercase">
                                  No hay insumos registrados con ese nombre.
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>

                {/* Ingredients Pagination Controls */}
                {filteredIngredients.length > 0 && (() => {
                  const ITEMS_PER_PAGE = 10;
                  const totalPages = Math.max(1, Math.ceil(filteredIngredients.length / ITEMS_PER_PAGE));
                  const startIndex = (ingCurrentPage - 1) * ITEMS_PER_PAGE;
                  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredIngredients.length);

                  return (
                    <div className="flex flex-col sm:flex-row items-center justify-between border-t-3 border-black p-4 bg-zinc-50 text-xs font-bold text-black gap-3">
                      <div className="uppercase font-black text-[10px] tracking-wider text-zinc-700">
                        Mostrando {startIndex + 1}-{endIndex} de {filteredIngredients.length} insumos
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          disabled={ingCurrentPage === 1}
                          onClick={() => setIngCurrentPage(1)}
                          className="px-2.5 py-1.5 border-2 border-black bg-white rounded-md text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-100 disabled:opacity-40 disabled:hover:bg-white active:translate-y-0.5 disabled:active:translate-y-0 cursor-pointer disabled:cursor-not-allowed"
                        >
                          « Primera
                        </button>
                        <button
                          type="button"
                          disabled={ingCurrentPage === 1}
                          onClick={() => setIngCurrentPage(p => Math.max(1, p - 1))}
                          className="px-2.5 py-1.5 border-2 border-black bg-white rounded-md text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-100 disabled:opacity-40 disabled:hover:bg-white active:translate-y-0.5 disabled:active:translate-y-0 cursor-pointer disabled:cursor-not-allowed"
                        >
                          ‹ Anterior
                        </button>
                        
                        <span className="font-retro-mono bg-yellow-200 border-2 border-black px-2.5 py-1 rounded text-[10px] font-black">
                          PÁG {ingCurrentPage} / {totalPages}
                        </span>

                        <button
                          type="button"
                          disabled={ingCurrentPage === totalPages}
                          onClick={() => setIngCurrentPage(p => Math.min(totalPages, p + 1))}
                          className="px-2.5 py-1.5 border-2 border-black bg-white rounded-md text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-100 disabled:opacity-40 disabled:hover:bg-white active:translate-y-0.5 disabled:active:translate-y-0 cursor-pointer disabled:cursor-not-allowed"
                        >
                          Siguiente ›
                        </button>
                        <button
                          type="button"
                          disabled={ingCurrentPage === totalPages}
                          onClick={() => setIngCurrentPage(totalPages)}
                          className="px-2.5 py-1.5 border-2 border-black bg-white rounded-md text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-100 disabled:opacity-40 disabled:hover:bg-white active:translate-y-0.5 disabled:active:translate-y-0 cursor-pointer disabled:cursor-not-allowed"
                        >
                          Última »
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </>
          )}

          {/* FOOD, DRINK AND COMBOS INVENTORIES */}
          {activeSubTab !== 'materia_prima' && (
            <>
              {/* Dynamic Stats Row for finished products */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="bg-[#fbcfe8] border-3 border-black rounded-xl p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-black font-black font-retro-mono">PRODUCTOS REGISTRADOS</p>
                    <h3 className="text-3xl font-retro-heavy text-black mt-1">{filteredProducts.length}</h3>
                  </div>
                  <div className="w-11 h-11 rounded-lg bg-white border-2 border-black flex items-center justify-center text-black">
                    {activeSubTab === 'inv_comida' ? <Utensils className="w-5 h-5" /> : activeSubTab === 'inv_bebidas' ? <Coffee className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
                  </div>
                </div>

                <div className="bg-[#ccfbf1] border-3 border-black rounded-xl p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-black font-black font-retro-mono">CON RECETA ENLAZADA</p>
                    <h3 className="text-3xl font-retro-heavy text-emerald-950 mt-1">
                      {filteredProducts.filter(item => item.ingredients && item.ingredients.length > 0).length}
                    </h3>
                  </div>
                  <div className="w-11 h-11 rounded-lg bg-white text-black border-2 border-black flex items-center justify-center">
                    <FileText className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* Product Inventory Catalog */}
              <div className="bg-white border-4 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden" id="products-inventory-panel">
                <div className="border-b-4 border-black p-5 bg-cyan-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-black">
                  <div>
                    <h3 className="font-retro-heavy text-base uppercase">
                      {activeSubTab === 'inv_comida' && '🍰 DISPONIBILIDAD DE COMIDAS / REPOSTERÍA'}
                      {activeSubTab === 'inv_bebidas' && '☕ DISPONIBILIDAD DE BEBIDAS'}
                      {activeSubTab === 'inv_combos' && '🍔 DISPONIBILIDAD DE COMBOS ESPECIALES'}
                    </h3>
                    <p className="text-xs font-bold uppercase text-black/80 mt-0.5">
                      Cálculo de existencias disponibles en base a stock de materia prima
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                      onClick={handleDownloadPDF}
                      className="flex items-center gap-1.5 bg-white hover:bg-zinc-100 text-black border-3 border-black rounded-lg px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-y-0.5"
                      title="Descargar PDF"
                    >
                      <FileText className="w-4 h-4 stroke-[2.5]" />
                      PDF
                    </button>
                    <button
                      onClick={handleAddProductClick}
                      className="flex items-center justify-center gap-1.5 bg-yellow-300 hover:bg-yellow-200 text-black border-3 border-black rounded-lg px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-y-0.5"
                    >
                      <Plus className="w-4 h-4 stroke-[3]" />
                      {activeSubTab === 'inv_comida' ? 'NUEVA COMIDA' : activeSubTab === 'inv_bebidas' ? 'NUEVA BEBIDA' : 'NUEVO COMBO'}
                    </button>
                  </div>
                </div>

                {/* Search box */}
                <div className="p-4 border-b-3 border-black bg-white">
                  <div className="relative">
                    <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-black stroke-[2.5]" />
                    <input
                      type="text"
                      placeholder="Escribe para buscar un producto..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border-2 border-black bg-[#fafaf9] rounded-lg text-xs font-extrabold focus:outline-none focus:bg-pink-50 font-retro-mono text-black"
                    />
                  </div>
                </div>

                {/* Products Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-yellow-100 text-[10px] font-black text-black uppercase tracking-widest border-b-3 border-black">
                        <th className="py-3 px-5">Producto / Menú</th>
                        <th className="py-3 px-5 text-center">Insumos Fórmula</th>
                        <th className="py-3 px-5 text-right">Margen Estimado</th>
                        <th className="py-3 px-5 text-right font-retro-mono">Precio Venta</th>
                        <th className="py-3 px-5 text-center">Stock Disponible</th>
                        <th className="py-3 px-5 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-2 divide-dashed divide-black/15 text-xs text-black font-bold">
                      {(() => {
                        const ITEMS_PER_PAGE = 10;
                        const paginatedProducts = filteredProducts.slice(
                          (prodCurrentPage - 1) * ITEMS_PER_PAGE,
                          prodCurrentPage * ITEMS_PER_PAGE
                        );

                        return (
                          <>
                            {paginatedProducts.map((item) => {
                              const maxAvailable = calculateMaxStockAvailable(item);
                              const recipeCost = calculateRecipeCost(item);
                              const profit = item.price - recipeCost;
                              const marginPercent = item.price > 0 ? (profit / item.price) * 100 : 0;

                              return (
                                <tr key={item.id} className="hover:bg-pink-50/40 transition-colors">
                                  <td className="py-3.5 px-5">
                                    <p className="font-black text-black text-sm uppercase">{item.name}</p>
                                    <span className="text-[10px] text-zinc-500 font-retro-mono font-bold uppercase">
                                      Categoría: {
                                        item.category === 'cafe_caliente' ? 'Café Caliente y Tradicional' :
                                        item.category === 'tes_infusiones' ? 'Tés e Infusiones' :
                                        item.category === 'bebidas_frias_frappes' ? 'Bebidas Frías y Frappés' :
                                        item.category === 'zumos_jugos' ? 'Zumos y Jugos Naturales' :
                                        item.category === 'bebidas_envasadas' ? 'Bebidas envasadas' :
                                        item.category === 'bebidas_alcoholicas' ? 'Bebidas alcohólicas' :
                                        item.category === 'cafes' ? 'Café Caliente' :
                                        item.category === 'bebidas_frias' ? 'Bebida / Alimento' :
                                        item.category === 'reposteria' ? 'Pastelería' :
                                        item.category === 'alimentos' ? 'Alimento' :
                                        item.category === 'combos' ? 'Combo' : item.category
                                      }
                                    </span>
                                  </td>

                                  <td className="py-3.5 px-5 text-center">
                                    <span className="inline-block px-2.5 py-0.5 rounded-full border border-black bg-yellow-100 font-retro-mono text-black text-[10px] font-black uppercase">
                                      {item.ingredients?.length || 0} INGREDIENTES
                                    </span>
                                  </td>

                                  <td className="py-3.5 px-5 text-right">
                                    <div className="flex flex-col items-end">
                                      <span className="text-emerald-700 font-black font-retro-mono">${formatNum(profit)}</span>
                                      <span className="text-[10px] text-zinc-500 font-black">{formatNum(marginPercent, 0)}% Rent.</span>
                                    </div>
                                  </td>

                                  <td className="py-3.5 px-5 text-right text-sm font-retro-mono font-black text-black">
                                    ${formatNum(item.price)}
                                  </td>

                                  <td className="py-3.5 px-5 text-center">
                                    {item.category === 'reposteria' || item.category === 'alimentos' || item.category === 'combos' ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-black bg-lime-300 text-black text-[10px] font-black uppercase">
                                        ⚡ DISPONIBLE
                                      </span>
                                    ) : maxAvailable === 0 ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-black bg-red-300 text-black text-[10px] font-black uppercase">
                                        ⚠️ AGOTADO
                                      </span>
                                    ) : maxAvailable <= 3 ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-black bg-amber-300 text-black text-[10px] font-black uppercase">
                                        🚨 BAJO (x{maxAvailable})
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-black bg-lime-300 text-black text-[10px] font-black uppercase">
                                        ⚡ x{maxAvailable} DISP
                                      </span>
                                    )}
                                  </td>

                                  <td className="py-3.5 px-5 text-center">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button
                                        onClick={() => setSelectedProduct(item)}
                                        className="bg-purple-300 hover:bg-purple-400 border-2 border-black text-black px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-[1px_1px_0px_0px_#000] active:translate-y-0.5"
                                        title="Ver Receta"
                                      >
                                        Receta
                                      </button>
                                      {item.stock !== undefined && (!item.ingredients || item.ingredients.length === 0) && (
                                        <button
                                          onClick={() => setRestockingMenuItem(item)}
                                          className="bg-lime-300 hover:bg-lime-400 border-2 border-black text-black px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-[1px_1px_0px_0px_#000] active:translate-y-0.5"
                                          title="Comprar / Reabastecer"
                                        >
                                          Comprar
                                        </button>
                                      )}
                                      <button
                                        onClick={() => handleEditProductClick(item)}
                                        className="bg-cyan-200 hover:bg-cyan-300 border-2 border-black text-black p-1.5 rounded transition-all cursor-pointer shadow-[1px_1px_0px_0px_#000] active:translate-y-0.5"
                                        title="Editar Producto"
                                      >
                                        <Edit className="w-3.5 h-3.5 stroke-[2.5]" />
                                      </button>
                                      <button
                                        onClick={() => {
                                          setDeleteModal({
                                            isOpen: true,
                                            type: 'product',
                                            id: item.id,
                                            name: item.name
                                          });
                                        }}
                                        className="bg-red-300 hover:bg-red-400 border-2 border-black text-black p-1.5 rounded transition-all cursor-pointer shadow-[1px_1px_0px_0px_#000] active:translate-y-0.5"
                                        title="Eliminar Producto"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 stroke-[2.5]" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}

                            {filteredProducts.length === 0 && (
                              <tr>
                                <td colSpan={6} className="py-10 text-center text-zinc-500 font-black uppercase">
                                  No hay productos registrados en esta sección del menú.
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>

                {/* Products Pagination Controls */}
                {filteredProducts.length > 0 && (() => {
                  const ITEMS_PER_PAGE = 10;
                  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
                  const startIndex = (prodCurrentPage - 1) * ITEMS_PER_PAGE;
                  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredProducts.length);

                  return (
                    <div className="flex flex-col sm:flex-row items-center justify-between border-t-3 border-black p-4 bg-zinc-50 text-xs font-bold text-black gap-3">
                      <div className="uppercase font-black text-[10px] tracking-wider text-zinc-700">
                        Mostrando {startIndex + 1}-{endIndex} de {filteredProducts.length} productos
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          disabled={prodCurrentPage === 1}
                          onClick={() => setProdCurrentPage(1)}
                          className="px-2.5 py-1.5 border-2 border-black bg-white rounded-md text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-100 disabled:opacity-40 disabled:hover:bg-white active:translate-y-0.5 disabled:active:translate-y-0 cursor-pointer disabled:cursor-not-allowed"
                        >
                          « Primera
                        </button>
                        <button
                          type="button"
                          disabled={prodCurrentPage === 1}
                          onClick={() => setProdCurrentPage(p => Math.max(1, p - 1))}
                          className="px-2.5 py-1.5 border-2 border-black bg-white rounded-md text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-100 disabled:opacity-40 disabled:hover:bg-white active:translate-y-0.5 disabled:active:translate-y-0 cursor-pointer disabled:cursor-not-allowed"
                        >
                          ‹ Anterior
                        </button>
                        
                        <span className="font-retro-mono bg-yellow-200 border-2 border-black px-2.5 py-1 rounded text-[10px] font-black">
                          PÁG {prodCurrentPage} / {totalPages}
                        </span>

                        <button
                          type="button"
                          disabled={prodCurrentPage === totalPages}
                          onClick={() => setProdCurrentPage(p => Math.min(totalPages, p + 1))}
                          className="px-2.5 py-1.5 border-2 border-black bg-white rounded-md text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-100 disabled:opacity-40 disabled:hover:bg-white active:translate-y-0.5 disabled:active:translate-y-0 cursor-pointer disabled:cursor-not-allowed"
                        >
                          Siguiente ›
                        </button>
                        <button
                          type="button"
                          disabled={prodCurrentPage === totalPages}
                          onClick={() => setProdCurrentPage(totalPages)}
                          className="px-2.5 py-1.5 border-2 border-black bg-white rounded-md text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-100 disabled:opacity-40 disabled:hover:bg-white active:translate-y-0.5 disabled:active:translate-y-0 cursor-pointer disabled:cursor-not-allowed"
                        >
                          Última »
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </>
          )}

        </div>

        {/* Right panel: Dynamic Info / Forms (Restock or Recipe specs) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* MATERIA PRIMA FORMS */}
          {activeSubTab === 'materia_prima' && (
            <>
              {/* Ingredient Quick Restock Form */}
              {selectedIngredient && (
                <div className="bg-white border-4 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-5 space-y-4 animate-fade-in" id="restock-action-panel">
                  <div className="flex items-center justify-between border-b-3 border-black pb-3">
                    <div className="flex items-center gap-2">
                      <Activity className="w-5 h-5 text-black stroke-[2.5]" />
                      <h3 className="font-retro-heavy text-xs uppercase text-purple-950">📦 REABASTECIMIENTO</h3>
                    </div>
                    <button 
                      onClick={() => setSelectedIngredient(null)}
                      className="bg-red-400 border-2 border-black px-1.5 py-0.5 rounded text-[10px] text-black hover:bg-red-500 cursor-pointer font-black uppercase"
                    >
                      CERRAR
                    </button>
                  </div>

                  <form onSubmit={handleRestockSubmit} className="space-y-4">
                    <div className="text-xs text-black space-y-2 bg-yellow-100 p-4 border-2 border-black rounded-lg font-bold">
                      <p><strong>Insumo:</strong> {selectedIngredient.name.toUpperCase()}</p>
                      <p><strong>Stock actual:</strong> {selectedIngredient.stock.toLocaleString('es-ES')} {selectedIngredient.unit}</p>
                      <p><strong>Costo de Compra:</strong> ${formatNum(selectedIngredient.costPerUnit, 4)} USD por {selectedIngredient.unit}</p>
                    </div>

                    <div>
                      <label className="block text-xs uppercase tracking-wider font-black text-black mb-1.5">
                        Cantidad a Comprar ({selectedIngredient.unit})
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        placeholder={`Ej. 500`}
                        value={restockQty}
                        onChange={(e) => setRestockQty(e.target.value)}
                        className="w-full border-3 border-black bg-yellow-50 rounded-lg p-2.5 text-xs font-retro-mono font-black text-black focus:outline-none focus:bg-cyan-50"
                        autoFocus
                      />
                    </div>

                    <div className="flex justify-between items-center text-xs border-t-2 border-dashed border-black/30 pt-3">
                      <span className="text-zinc-600 font-bold uppercase">Gasto total estimado:</span>
                      <span className="font-retro-mono font-black text-lg bg-yellow-300 border border-black px-2 py-0.5 rounded">
                        ${formatNum((parseNum(restockQty) || 0) * selectedIngredient.costPerUnit)} USD
                      </span>
                    </div>

                    <button
                      type="submit"
                      disabled={!restockQty || parseNum(restockQty) <= 0}
                      className="w-full bg-lime-300 hover:bg-lime-400 disabled:bg-zinc-200 disabled:text-zinc-500 disabled:cursor-not-allowed border-3 border-black text-black text-xs font-black py-3 rounded-lg shadow-[3px_3px_0px_0px_#000] active:translate-y-0.5 cursor-pointer uppercase tracking-wider"
                    >
                      CONFIRMAR REABASTO
                    </button>
                  </form>
                </div>
              )}

              {/* Add New Ingredient Form Drawer */}
              {isAddingIngredient && (
                <div className="bg-white border-4 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-5 space-y-4 animate-fade-in" id="add-ingredient-panel">
                  <div className="flex items-center justify-between border-b-3 border-black pb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-black stroke-[2.5]" />
                      <h3 className="font-retro-heavy text-xs uppercase text-purple-950">👾 NUEVO INSUMO</h3>
                    </div>
                    <button 
                      onClick={() => setIsAddingIngredient(false)}
                      className="bg-red-400 border-2 border-black px-1.5 py-0.5 rounded text-[10px] text-black hover:bg-red-500 cursor-pointer font-black uppercase"
                    >
                      CERRAR
                    </button>
                  </div>

                  <form onSubmit={handleAddIngredientSubmit} className="space-y-4 text-xs font-bold text-black">
                    <div>
                      <label className="block font-black uppercase mb-1">Nombre del Insumo</label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. Vasos de cartón 8oz, Leche entera..."
                        value={newIngName}
                        onChange={(e) => setNewIngName(e.target.value)}
                        className="w-full border-3 border-black bg-pink-50 rounded-lg p-2.5 focus:outline-none focus:bg-white text-black font-extrabold"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-black uppercase mb-1">Medida</label>
                        <RetroSelect
                          value={newIngUnit}
                          onChange={(val) => setNewIngUnit(val)}
                          options={UNIT_OPTIONS}
                        />
                      </div>

                      <div>
                        <label className="block font-black uppercase mb-1">Costo Unitario (USD)</label>
                        <input
                          type="number"
                          step="0.0001"
                          required
                          placeholder="0.00"
                          value={newIngCost}
                          onChange={(e) => setNewIngCost(e.target.value)}
                          className="w-full border-3 border-black bg-pink-50 rounded-lg p-2.5 focus:outline-none focus:bg-white font-retro-mono font-black text-black"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-black uppercase mb-1">Stock Inicial</label>
                      <input
                        type="number"
                        step="0.1"
                        required
                        placeholder="0"
                        value={newIngStock}
                        onChange={(e) => setNewIngStock(e.target.value)}
                        className="w-full border-3 border-black bg-pink-50 rounded-lg p-2.5 focus:outline-none focus:bg-white font-retro-mono"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-lime-300 hover:bg-lime-400 text-black border-3 border-black rounded-lg py-3.5 text-xs font-black shadow-[3px_3px_0px_0px_#000] active:translate-y-0.5 cursor-pointer uppercase tracking-wider"
                    >
                      REGISTRAR MATERIA PRIMA
                    </button>
                  </form>
                </div>
              )}

              {/* Edit Ingredient Form Drawer */}
              {editingIngredient && (
                <div className="bg-white border-4 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-5 space-y-4 animate-fade-in" id="edit-ingredient-panel">
                  <div className="flex items-center justify-between border-b-3 border-black pb-3">
                    <div className="flex items-center gap-2">
                      <Edit className="w-5 h-5 text-black stroke-[2.5]" />
                      <h3 className="font-retro-heavy text-xs uppercase text-purple-950">✏️ EDITAR INSUMO</h3>
                    </div>
                    <button 
                      onClick={() => setEditingIngredient(null)}
                      className="bg-red-400 border-2 border-black px-1.5 py-0.5 rounded text-[10px] text-black hover:bg-red-500 cursor-pointer font-black uppercase"
                    >
                      CERRAR
                    </button>
                  </div>

                  <form onSubmit={handleEditIngredientSubmit} className="space-y-4 text-xs font-bold text-black">
                    <div>
                      <label className="block font-black uppercase mb-1">Nombre del Insumo</label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. Vasos de cartón 8oz, Leche entera..."
                        value={editIngName}
                        onChange={(e) => setEditIngName(e.target.value)}
                        className="w-full border-3 border-black bg-cyan-50 rounded-lg p-2.5 focus:outline-none focus:bg-white text-black font-extrabold"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-black uppercase mb-1">Medida</label>
                        <RetroSelect
                          value={editIngUnit}
                          onChange={(val) => setEditIngUnit(val)}
                          options={UNIT_OPTIONS}
                        />
                      </div>

                      <div>
                        <label className="block font-black uppercase mb-1">Costo Unitario (USD)</label>
                        <input
                          type="number"
                          step="0.0001"
                          required
                          placeholder="0.00"
                          value={editIngCost}
                          onChange={(e) => setEditIngCost(e.target.value)}
                          className="w-full border-3 border-black bg-cyan-50 rounded-lg p-2.5 focus:outline-none focus:bg-white font-retro-mono font-black text-black"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-black uppercase mb-1">Existencia (Stock)</label>
                      <input
                        type="number"
                        step="0.1"
                        required
                        placeholder="0"
                        value={editIngStock}
                        onChange={(e) => setEditIngStock(e.target.value)}
                        className="w-full border-3 border-black bg-cyan-50 rounded-lg p-2.5 focus:outline-none focus:bg-white font-retro-mono"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-lime-300 hover:bg-lime-400 text-black border-3 border-black rounded-lg py-3.5 text-xs font-black shadow-[3px_3px_0px_0px_#000] active:translate-y-0.5 cursor-pointer uppercase tracking-wider"
                    >
                      GUARDAR CAMBIOS
                    </button>
                  </form>
                </div>
              )}
            </>
          )}

          {/* PRODUCT CREATION/EDITING FORM inside right panel */}
          {activeSubTab !== 'materia_prima' && (isAddingProduct || editingProductItem) && (
            <div className="bg-white border-4 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-5 space-y-4 animate-fade-in" id="inventory-product-form">
              <div className="flex items-center justify-between border-b-3 border-black pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-black stroke-[2.5]" />
                  <h3 className="font-retro-heavy text-xs uppercase text-purple-950">
                    {editingProductItem ? '✏️ EDITAR PRODUCTO' : '✨ CREAR PRODUCTO'}
                  </h3>
                </div>
                <button 
                  onClick={() => {
                    setIsAddingProduct(false);
                    setEditingProductItem(null);
                  }}
                  className="bg-red-400 border-2 border-black px-1.5 py-0.5 rounded text-[10px] text-black hover:bg-red-500 cursor-pointer font-black uppercase"
                >
                  CERRAR
                </button>
              </div>

              <form onSubmit={handleProductSubmit} className="space-y-4 text-xs font-bold text-black">
                <div>
                  <label className="block font-black uppercase mb-1">Nombre del Producto</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Éclair de chocolate, Cold Brew 12oz..."
                    value={prodName}
                    onChange={(e) => setProdName(e.target.value)}
                    className="w-full border-3 border-black bg-pink-50 rounded-lg p-2.5 focus:outline-none focus:bg-white text-black font-extrabold"
                  />
                </div>


                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-black uppercase mb-1">Categoría</label>
                    <RetroSelect
                      value={prodCat}
                      onChange={(val) => setProdCat(val as CategoryType)}
                      options={
                        activeSubTab === 'inv_bebidas' ? [
                          { value: 'cafe_caliente', label: '☕ Café Caliente y Tradicional' },
                          { value: 'tes_infusiones', label: '🍵 Tés e Infusiones' },
                          { value: 'bebidas_frias_frappes', label: '🥤 Bebidas Frías y Frappés' },
                          { value: 'zumos_jugos', label: '🍹 Zumos y Jugos Naturales' },
                          { value: 'bebidas_envasadas', label: '🧴 Bebidas envasadas' },
                          { value: 'bebidas_alcoholicas', label: '🍺 Bebidas alcohólicas' },
                          { value: 'gaseosas', label: '🥤 Gaseosas' },
                          { value: 'cafes', label: '☕ [Legacy] Cafés' },
                          { value: 'bebidas_frias', label: '🥤 [Legacy] Bebidas Frías' },
                        ] : activeSubTab === 'inv_comida' ? [
                          { value: 'reposteria', label: '🍰 Repostería' },
                          { value: 'alimentos', label: '🥪 Alimentos' },
                        ] : [
                          { value: 'combos', label: '🍔 Combos' },
                        ]
                      }
                    />
                  </div>

                  <div>
                    <label className="block font-black uppercase mb-1">Precio Venta (USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={prodPrice}
                      onChange={(e) => setProdPrice(e.target.value)}
                      className="w-full border-3 border-black bg-pink-50 rounded-lg p-2.5 focus:outline-none focus:bg-white font-retro-mono font-black text-black"
                    />
                  </div>
                </div>

                {activeSubTab === 'inv_bebidas' && (
                  <div>
                    <label className="block font-black uppercase mb-1">Stock Directo (Opcional)</label>
                    <input
                      type="number"
                      step="1"
                      placeholder="Dejar vacío si usa receta..."
                      value={prodStock}
                      onChange={(e) => setProdStock(e.target.value)}
                      className="w-full border-3 border-black bg-yellow-50 rounded-lg p-2.5 focus:outline-none focus:bg-white font-retro-mono text-black font-black"
                    />
                    <p className="text-[9px] text-zinc-600 font-bold mt-1 leading-normal">
                      Solo para productos de venta directa sin receta (ej. bebidas envasadas, postres comprados hechos).
                    </p>
                  </div>
                )}

                {/* Formula / Recipe requirements */}
                <div className="border-3 border-black rounded-xl p-3.5 space-y-3 bg-yellow-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                  <div className="flex justify-between items-center border-b-2 border-black pb-2 text-black">
                    <span className="font-retro-heavy text-[9px] uppercase">
                      {prodCat === 'combos' ? 'COMPOSICIÓN DEL COMBO' : 'FÓRMULA & RECETARIO'}
                    </span>
                    <span className="text-[9px] bg-black text-lime-400 px-1 rounded font-retro-mono font-bold">CANTIDAD A DESCONTAR AL VENDER</span>
                  </div>

                  <div className="flex items-end gap-1.5 text-[11px] font-bold">
                    <div className="flex-1 min-w-0">
                      <label className="block text-[9px] font-black text-black uppercase mb-1">
                        {prodCat === 'combos' ? 'Producto (Bebida/Comida)' : 'Materia Prima'}
                      </label>
                      <RetroSelect
                        value={selectedIngredientId}
                        onChange={(val) => setSelectedIngredientId(val)}
                        placeholder="-- Seleccionar --"
                        dense
                        options={[
                          { value: '', label: '-- Seleccionar --' },
                          ...(prodCat === 'combos'
                            ? menuItems
                                .filter(item => item.category !== 'combos')
                                .map(item => ({
                                  value: item.id,
                                  label: `${item.name.toUpperCase()} (${
                                    item.category === 'cafes' || item.category === 'bebidas_frias' ? 'BEBIDA' : 'ALIMENTO'
                                  })`
                                }))
                            : ingredients.map(ing => ({
                                value: ing.id,
                                label: `${ing.name.toUpperCase()} (${ing.unit})`
                              }))
                          )
                        ]}
                      />
                    </div>

                    <div className="w-16 flex-shrink-0">
                      <label className="block text-[9px] font-black text-black uppercase mb-1">Cant.</label>
                      <input
                        type="number"
                        step="0.1"
                        placeholder="10"
                        value={ingredientQuantityNeeded}
                        onChange={(e) => setIngredientQuantityNeeded(e.target.value)}
                        className="w-full border-2 border-black rounded p-1.5 font-retro-mono text-center font-black bg-white text-black"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleProductAddRequirement}
                      className="bg-purple-300 hover:bg-purple-400 text-black border-2 border-black rounded p-1.5 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 cursor-pointer flex-shrink-0"
                      title={prodCat === 'combos' ? "Enlazar producto" : "Enlazar ingrediente"}
                    >
                      <Plus className="w-4 h-4 stroke-[3]" />
                    </button>
                  </div>

                  {/* Linked ingredients list */}
                  <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
                    {recipeRequirements.map((req, idx) => {
                      if (prodCat === 'combos') {
                        const component = menuItems.find(m => m.id === req.ingredientId);
                        return (
                          <div key={idx} className="flex justify-between items-center bg-white p-2 rounded border-2 border-black text-[10px] font-bold text-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] gap-1">
                            <span className="font-black truncate uppercase min-w-0 flex-1">{component?.name || req.ingredientId} (PRODUCTO)</span>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className="font-retro-mono font-black text-purple-800">{req.quantity} pz</span>
                              <button
                                type="button"
                                onClick={() => handleProductRemoveRequirement(idx)}
                                className="bg-red-400 border border-black text-black px-1 rounded text-[9px] font-black cursor-pointer hover:bg-red-500"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        );
                      } else {
                        const ing = ingredients.find(i => i.id === req.ingredientId);
                        return (
                          <div key={idx} className="flex justify-between items-center bg-white p-2 rounded border-2 border-black text-[10px] font-bold text-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] gap-1">
                            <span className="font-black truncate uppercase min-w-0 flex-1">{ing?.name || req.ingredientId}</span>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className="font-retro-mono font-black text-purple-800">{req.quantity} {ing?.unit}</span>
                              <button
                                type="button"
                                onClick={() => handleProductRemoveRequirement(idx)}
                                className="bg-red-400 border border-black text-black px-1 rounded text-[9px] font-black cursor-pointer hover:bg-red-500"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        );
                      }
                    })}

                    {recipeRequirements.length === 0 && (
                      <p className="text-[10px] text-zinc-600 font-bold italic text-center py-1">
                        {prodCat === 'combos' ? 'Ningún producto enlazado. Combo vacío.' : 'Ningún insumo enlazado. Se venderá libre sin deducir.'}
                      </p>
                    )}
                  </div>
                </div>



                <button
                  type="submit"
                  className="w-full bg-lime-300 hover:bg-lime-400 text-black border-3 border-black rounded-lg py-3.5 text-xs font-black shadow-[3px_3px_0px_0px_#000] active:translate-y-0.5 cursor-pointer uppercase tracking-wider"
                >
                  {editingProductItem ? 'GUARDAR CAMBIOS' : 'REGISTRAR EN MENÚ'}
                </button>
              </form>
            </div>
          )}

          {/* RECIPE AND SPEC DETAILS PANEL FOR COMIDA/BEBIDAS/COMBOS */}
          {activeSubTab !== 'materia_prima' && !(isAddingProduct || editingProductItem) && (
            <div className="bg-white border-4 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-5 space-y-4">
              {selectedProduct ? (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between border-b-3 border-black pb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-black stroke-[2.5]" />
                      <h3 className="font-retro-heavy text-xs uppercase text-purple-950">📋 FÓRMULA DE RECETA</h3>
                    </div>
                    <button 
                      onClick={() => setSelectedProduct(null)}
                      className="bg-red-400 border-2 border-black px-1.5 py-0.5 rounded text-[10px] text-black hover:bg-red-500 cursor-pointer font-black uppercase"
                    >
                      CERRAR
                    </button>
                  </div>

                  <div className="space-y-1">
                    <h4 className="font-retro-heavy text-lg text-black uppercase">{selectedProduct.name}</h4>
                    <p className="text-xs text-zinc-600 font-bold">{selectedProduct.description}</p>
                  </div>

                  {/* Financial Metrics Card */}
                  <div className="grid grid-cols-2 gap-3.5 bg-zinc-50 border-3 border-black p-4 rounded-xl shadow-[2px_2px_0px_0px_#000]">
                    <div>
                      <span className="block text-[9px] uppercase font-black text-zinc-500 tracking-wider">COSTO ESTIMADO</span>
                      <span className="text-base font-retro-mono font-black text-red-600">
                        ${formatNum(calculateRecipeCost(selectedProduct))}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase font-black text-zinc-500 tracking-wider">MARGEN NETO</span>
                      <span className="text-base font-retro-mono font-black text-emerald-600">
                        ${formatNum(selectedProduct.price - calculateRecipeCost(selectedProduct))}
                      </span>
                    </div>
                  </div>

                   {/* List of Ingredients Required */}
                  <div className="space-y-2.5">
                    <h5 className="font-retro-heavy text-xs uppercase text-zinc-700">
                      {selectedProduct.category === 'combos' ? 'Productos del Combo:' : 'Insumos Necesarios:'}
                    </h5>
                    
                    {!selectedProduct.ingredients || selectedProduct.ingredients.length === 0 ? (
                      <div className="border-2 border-dashed border-zinc-300 p-4 text-center rounded-lg text-xs font-bold text-zinc-500 uppercase">
                        {selectedProduct.category === 'combos' ? 'Sin componentes agregados a este combo.' : 'Sin receta vinculada. El producto es directo.'}
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {selectedProduct.ingredients.map((req) => {
                          if (selectedProduct.category === 'combos') {
                            const component = menuItems.find((m) => m.id === req.ingredientId);
                            const componentAvailable = component ? calculateMaxStockAvailable(component) : 0;
                            const isShort = componentAvailable < req.quantity;
                            return (
                              <div key={req.ingredientId} className="flex items-center justify-between border-2 border-black rounded-lg p-2.5 bg-cyan-50 text-xs font-bold text-black text-left">
                                <div>
                                  <p className="font-black uppercase">{component?.name || 'Producto desconocido'}</p>
                                  <p className="text-[10px] text-zinc-500 font-retro-mono">
                                    Categoría: {component ? (component.category === 'cafes' || component.category === 'bebidas_frias' ? '☕ Bebida' : '🍰 Alimento') : 'Desconocida'}
                                  </p>
                                  <p className="text-[10px] text-zinc-500 font-retro-mono">Requiere: {req.quantity} pz</p>
                                </div>
                                <div className="text-right">
                                  <p className="font-retro-mono font-black text-zinc-700">Disponibles: {componentAvailable} pz</p>
                                  {isShort ? (
                                    <span className="text-[9px] uppercase font-black text-red-600">Insuficiente</span>
                                  ) : (
                                    <span className="text-[9px] uppercase font-black text-emerald-600">Suficiente</span>
                                  )}
                                </div>
                              </div>
                            );
                          } else {
                            const ing = ingredients.find((i) => i.id === req.ingredientId);
                            const isShort = ing ? ing.stock < req.quantity : true;
                            return (
                              <div key={req.ingredientId} className="flex items-center justify-between border-2 border-black rounded-lg p-2.5 bg-yellow-50 text-xs font-bold text-black text-left">
                                <div>
                                  <p className="font-black uppercase">{ing?.name || 'Insumo desconocido'}</p>
                                  <p className="text-[10px] text-zinc-500 font-retro-mono">Dosis: {req.quantity} {ing?.unit}</p>
                                </div>
                                <div className="text-right">
                                  <p className="font-retro-mono font-black text-zinc-700">Stock: {ing?.stock.toLocaleString('es-ES')} {ing?.unit}</p>
                                  {isShort ? (
                                    <span className="text-[9px] uppercase font-black text-red-600">Insuficiente</span>
                                  ) : (
                                    <span className="text-[9px] uppercase font-black text-emerald-600">Suficiente</span>
                                  )}
                                </div>
                              </div>
                            );
                          }
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full border-3 border-black bg-pink-100 flex items-center justify-center mx-auto">
                    <FileText className="w-6 h-6 text-black" />
                  </div>
                  <h4 className="font-retro-heavy text-sm uppercase text-black">DETALLES DE RECETAS</h4>
                  <p className="text-[11px] font-bold text-zinc-600 uppercase tracking-tight leading-normal">
                    Haz clic en el botón <strong className="bg-purple-100 border border-black px-1 py-0.2 rounded font-black text-purple-900">VER RECETA</strong> de cualquier alimento, bebida o combo para visualizar su desglose de costo, rentabilidad porcentual y disponibilidad exacta de existencias.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Simple instructional Card on how Stock Deduction works */}
          <div className="bg-yellow-100 border-3 border-black rounded-xl p-5 space-y-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] text-black">
            <h4 className="font-retro-heavy text-xs uppercase flex items-center gap-2">
              <FileText className="w-5 h-5 text-black stroke-[2.5]" />
              DEDUCCIONES AUTOMÁTICAS
            </h4>
            <p className="text-[11px] font-bold leading-relaxed uppercase">
              Cada producto del menú está enlazado a sus materias primas e insumos. Al cobrar una venta desde el <strong>Punto de Venta (POS)</strong>, el sistema calcula y deduce proporcionalmente el gramaje, mililitros o piezas correspondientes de forma automática.
            </p>
          </div>
        </div>
      </div>

      {/* Custom Retro Modal for Delete Confirmation */}
      {deleteModal && deleteModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans" id="delete-confirmation-modal">
          <div className="bg-white border-4 border-black rounded-xl p-6 max-w-sm w-full shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] text-center space-y-5 animate-fade-in">
            <div className="w-16 h-16 bg-red-100 border-4 border-black text-red-600 rounded-full flex items-center justify-center mx-auto shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
              <Trash2 className="w-8 h-8 stroke-[2.5]" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-lg font-retro-heavy text-black uppercase tracking-wide leading-tight">
                ¿Estás seguro de eliminar este producto?
              </h3>
              <p className="text-xs font-black bg-zinc-100 border-2 border-black p-2 rounded-lg text-black uppercase break-words font-retro-mono">
                {deleteModal.name}
              </p>
              <p className="text-[10px] text-red-700 bg-red-50 border-2 border-red-200 p-2.5 rounded-lg leading-relaxed font-black uppercase">
                ⚠️ Esta acción es definitiva e irreversible. Se desvinculará de las recetas actuales del sistema.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                onClick={() => setDeleteModal(null)}
                className="bg-zinc-200 hover:bg-zinc-300 text-black border-3 border-black rounded-lg py-3 text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
              >
                No, cancelar
              </button>
              <button
                onClick={() => {
                  if (deleteModal.type === 'ingredient') {
                    onDeleteIngredient(deleteModal.id);
                  } else {
                    onDeleteMenuItem(deleteModal.id);
                  }
                  setDeleteModal(null);
                }}
                className="bg-red-400 hover:bg-red-500 text-black border-3 border-black rounded-lg py-3 text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] font-sans pointer-events-none transition-all duration-300" id="success-toast">
          <div className="bg-lime-200 border-4 border-black text-black px-6 py-4 rounded-xl flex items-center gap-3.5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] max-w-md pointer-events-auto">
            <div className="bg-white border-2 border-black p-1.5 rounded-full flex-shrink-0 shadow-[2px_2px_0px_0px_#000]">
              <Sparkles className="w-5 h-5 text-lime-700 fill-lime-300 stroke-[2.5]" />
            </div>
            <div className="font-extrabold text-xs md:text-sm uppercase tracking-wide pr-2">
              {toast.message}
            </div>
            <button 
              onClick={() => setToast(null)}
              className="ml-auto font-black text-xs bg-white border-2 border-black hover:bg-zinc-100 rounded px-1.5 py-0.5 shadow-[1px_1px_0px_0px_#000] cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Restock MenuItem Drawer */}
      {restockingMenuItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans" id="restock-menuitem-modal">
          <div className="bg-white border-4 border-black rounded-xl p-6 max-w-sm w-full shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] animate-fade-in">
            <div className="flex items-center justify-between border-b-3 border-black pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-black stroke-[2.5]" />
                <h3 className="font-retro-heavy text-xs uppercase text-purple-950">📦 COMPRAR STOCK DIRECTO</h3>
              </div>
              <button 
                onClick={() => setRestockingMenuItem(null)}
                className="bg-red-400 border-2 border-black px-1.5 py-0.5 rounded text-[10px] text-black hover:bg-red-500 cursor-pointer font-black uppercase"
              >
                CERRAR
              </button>
            </div>

            <form onSubmit={handleRestockMenuSubmit} className="space-y-4">
              <div className="text-xs text-black space-y-2 bg-yellow-100 p-4 border-2 border-black rounded-lg font-bold">
                <p><strong>Producto:</strong> {restockingMenuItem.name.toUpperCase()}</p>
                <p><strong>Stock actual:</strong> {restockingMenuItem.stock} unidades</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs uppercase tracking-wider font-black text-black mb-1.5">
                    Cantidad a Comprar
                  </label>
                  <input
                    type="number"
                    step="1"
                    required
                    placeholder={`Ej. 24`}
                    value={restockMenuQty}
                    onChange={(e) => setRestockMenuQty(e.target.value)}
                    className="w-full border-3 border-black bg-yellow-50 rounded-lg p-2.5 text-xs font-retro-mono font-black text-black focus:outline-none focus:bg-cyan-50"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider font-black text-black mb-1.5">
                    Costo Total (USD)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder={`Ej. 15.50`}
                    value={restockMenuTotalCost}
                    onChange={(e) => setRestockMenuTotalCost(e.target.value)}
                    className="w-full border-3 border-black bg-yellow-50 rounded-lg p-2.5 text-xs font-retro-mono font-black text-black focus:outline-none focus:bg-cyan-50"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-lime-300 hover:bg-lime-400 text-black border-3 border-black rounded-lg py-3 text-xs font-black shadow-[3px_3px_0px_0px_#000] active:translate-y-0.5 cursor-pointer uppercase tracking-wider mt-2"
              >
                CONFIRMAR COMPRA
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
