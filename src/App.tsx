/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Receipt, 
  Package, 
  TrendingUp, 
  Users, 
  AlertTriangle,
  Coffee
} from 'lucide-react';

import { MenuItem, Ingredient, Employee, Sale, Shift, Expense, SaleItem, CustomerDetails } from './types';
import { 
  initialIngredients, 
  initialMenuItems, 
  initialEmployees, 
  generateHistoricalSales, 
  initialExpenses 
} from './initialData';

import Header from './components/Header';
import POSView from './components/POSView';
import InventoryView from './components/InventoryView';
import AnalyticsView from './components/AnalyticsView';
import StaffView from './components/StaffView';
import SalesView from './components/SalesView';
import CustomersView from './components/CustomersView';

// SQLite Database imports
import { 
  db, 
  handleFirestoreError, 
  OperationType,
  collection, 
  doc, 
  setDoc, 
  getDoc,
  deleteDoc, 
  getDocs, 
  onSnapshot, 
  writeBatch 
} from './db';
import { removeUndefined } from './utils';

export default function App() {
  // 1. Core States
  const [businessName, setBusinessName] = useState<string>('moccapricho');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [customers, setCustomers] = useState<CustomerDetails[]>([]);

  // 2. Session / Shift States
  const [activeEmployee, setActiveEmployee] = useState<Employee | null>(null);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);

  // 3. UI Tab State
  const [activeTab, setActiveTab] = useState<'pos' | 'inventario' | 'analiticas' | 'personal' | 'ventas' | 'clientes'>('pos');

  // Load cache on boot (instant visual response)
  useEffect(() => {
    const savedName = localStorage.getItem('caf_business_name');
    if (savedName) setBusinessName(savedName);

    const savedMenu = localStorage.getItem('caf_menu_items');
    if (savedMenu) setMenuItems(JSON.parse(savedMenu));
    else setMenuItems(initialMenuItems);

    const savedIngredients = localStorage.getItem('caf_ingredients');
    if (savedIngredients) setIngredients(JSON.parse(savedIngredients));
    else setIngredients(initialIngredients);

    const savedEmployees = localStorage.getItem('caf_employees');
    if (savedEmployees) setEmployees(JSON.parse(savedEmployees));
    else setEmployees(initialEmployees);

    const savedSales = localStorage.getItem('caf_sales');
    if (savedSales) setSales(JSON.parse(savedSales));

    const savedExpenses = localStorage.getItem('caf_expenses');
    if (savedExpenses) setExpenses(JSON.parse(savedExpenses));

    const savedCustomers = localStorage.getItem('caf_customers');
    if (savedCustomers) {
      try {
        const parsed: CustomerDetails[] = JSON.parse(savedCustomers);
        const map = new Map<string, CustomerDetails>();
        parsed.forEach(c => {
          const key = (c.documentId || (c as any).id || '').trim();
          if (key) map.set(key, c);
        });
        const cleaned = Array.from(map.values());
        setCustomers(cleaned);
        localStorage.setItem('caf_customers', JSON.stringify(cleaned));
      } catch (e) {
        // ignore
      }
    }

    const savedShifts = localStorage.getItem('caf_shifts');
    let loadedShifts: Shift[] = [];
    if (savedShifts) {
      loadedShifts = JSON.parse(savedShifts);
      setShifts(loadedShifts);
    }
    const savedEmp = localStorage.getItem('caf_active_employee');
    if (savedEmp) {
      setActiveEmployee(JSON.parse(savedEmp));
    } else if (loadedShifts.length > 0) {
      const firstOpenShift = loadedShifts.find(s => s.status === 'open');
      if (firstOpenShift) {
        const associatedEmployee = initialEmployees.find(e => e.id === firstOpenShift.employeeId);
        if (associatedEmployee) setActiveEmployee(associatedEmployee);
      }
    }
  }, []);

  // Guarantee that an active employee is always set (for single-user mode)
  useEffect(() => {
    if (!activeEmployee) {
      const savedEmp = localStorage.getItem('caf_active_employee');
      if (savedEmp) {
        try {
          setActiveEmployee(JSON.parse(savedEmp));
        } catch (e) {
          // ignore
        }
      } else {
        const defaultEmp = employees.find(e => e.status === 'active') || initialEmployees[0];
        if (defaultEmp) {
          setActiveEmployee(defaultEmp);
          localStorage.setItem('caf_active_employee', JSON.stringify(defaultEmp));
        }
      }
    }
  }, [employees, activeEmployee]);

  // Auto-update admin name if it's the old 'Sofía Martínez'
  useEffect(() => {
    const admin = employees.find(e => e.id === 'emp_1');
    if (admin && admin.name === 'Sofía Martínez') {
      const updatedAdmin = { ...admin, name: 'GUERRERO CARDENAS ALEJANDRA ESTEFANIA' };
      
      // Update in local state to immediately show
      setEmployees(prev => prev.map(e => e.id === 'emp_1' ? updatedAdmin : e));
      
      // Update in Firestore
      setDoc(doc(db, "employees", "emp_1"), updatedAdmin).catch(err => {
        console.error("Error updating admin name in Firestore:", err);
      });
    }

    if (activeEmployee && activeEmployee.id === 'emp_1' && activeEmployee.name === 'Sofía Martínez') {
      const updatedActive = { ...activeEmployee, name: 'GUERRERO CARDENAS ALEJANDRA ESTEFANIA' };
      setActiveEmployee(updatedActive);
      localStorage.setItem('caf_active_employee', JSON.stringify(updatedActive));
    }
  }, [employees, activeEmployee]);

  // Ensure the default administrator (GUERRERO CARDENAS ALEJANDRA ESTEFANIA) always exists in the database
  useEffect(() => {
    if (employees.length > 0) {
      const hasAdmin = employees.some(e => e.id === 'emp_1');
      if (!hasAdmin) {
        const defaultAdmin = initialEmployees[0];
        console.log("Seeding default admin 'emp_1' because it was missing in database...");
        setEmployees(prev => [defaultAdmin, ...prev]);
        setDoc(doc(db, "employees", defaultAdmin.id), defaultAdmin).catch(err => {
          console.error("Error seeding default admin in Firestore:", err);
        });
      }
    }
  }, [employees]);

  // Synchronize activeShift with the current activeEmployee's open shift
  useEffect(() => {
    if (activeEmployee) {
      const empShift = shifts.find(s => s.status === 'open' && s.employeeId === activeEmployee.id);
      setActiveShift(empShift || null);
    } else {
      setActiveShift(null);
    }
  }, [activeEmployee, shifts]);

  // 4. Real-time Firestore Sync & Auto-Seeding
  useEffect(() => {
    // 1. Monitor Business Config
    const unsubBusiness = onSnapshot(doc(db, "config", "business"), (docSnap) => {
      if (docSnap.exists()) {
        const name = docSnap.data().name || 'moccapricho';
        if (name === 'Café Aromas') {
          // Auto upgrade old Cafe Aromas default to moccapricho
          setDoc(doc(db, "config", "business"), { id: "business", name: "moccapricho" }).catch(err => {
            console.error("Error upgrading business name in DB:", err);
          });
          setBusinessName('moccapricho');
          localStorage.setItem('caf_business_name', 'moccapricho');
        } else {
          setBusinessName(name);
          localStorage.setItem('caf_business_name', name);
        }
      } else {
        setDoc(doc(db, "config", "business"), { id: "business", name: "moccapricho" }).catch(err => {
          console.error("Error setting business name in DB:", err);
        });
      }
    }, (error) => {
      console.error("Error watching business configuration: ", error);
    });

    // Seeding Check
    const checkAndSeedDatabase = async () => {
      try {
        const sysSnap = await getDoc(doc(db, "config", "system"));
        if (sysSnap.exists() && sysSnap.data()?.seeded) {
          console.log("El sistema ya fue sembrado o limpiado. Omitiendo sembrado.");
          return;
        }

        const querySnap = await getDocs(collection(db, "ingredients"));
        if (querySnap.empty) {
          console.log("Firestore está vacío. Sembrando datos de demostración en la base de datos...");
          const batch = writeBatch(db);

          initialIngredients.forEach((ing) => {
            batch.set(doc(db, "ingredients", ing.id), ing);
          });

          initialMenuItems.forEach((item) => {
            batch.set(doc(db, "menuItems", item.id), item);
          });

          initialEmployees.forEach((emp) => {
            batch.set(doc(db, "employees", emp.id), emp);
          });

          initialExpenses.forEach((exp) => {
            batch.set(doc(db, "expenses", exp.id), exp);
          });

          const historicalSales = generateHistoricalSales();
          historicalSales.forEach((sale) => {
            batch.set(doc(db, "sales", sale.id), sale);
          });

          // Mark as seeded so we don't re-run this upon empty DB or clear action
          batch.set(doc(db, "config", "system"), { id: "system", seeded: true });

          await batch.commit();
          console.log("¡Sembrado completado exitosamente!");
        } else {
          // System already has some data, so mark it as seeded
          await setDoc(doc(db, "config", "system"), { id: "system", seeded: true });
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        if (errMsg.toLowerCase().includes('offline') || errMsg.toLowerCase().includes('unavailable') || errMsg.toLowerCase().includes('network')) {
          console.warn("Base de datos de Firebase en modo offline: Omitiendo verificación de sembrado.");
        } else {
          console.error("Error durante el sembrado de base de datos:", error);
        }
      }
    };

    checkAndSeedDatabase().then(() => {
      // 2. Watch Ingredients
      const unsubIngredients = onSnapshot(collection(db, "ingredients"), (snap) => {
        const list: Ingredient[] = [];
        snap.forEach((d) => list.push(d.data() as Ingredient));
        setIngredients(list);
        localStorage.setItem('caf_ingredients', JSON.stringify(list));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'ingredients'));

      // 3. Watch Menu Items
      const unsubMenuItems = onSnapshot(collection(db, "menuItems"), (snap) => {
        const list: MenuItem[] = [];
        snap.forEach((d) => list.push(d.data() as MenuItem));
        setMenuItems(list);
        localStorage.setItem('caf_menu_items', JSON.stringify(list));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'menuItems'));

      // 4. Watch Employees
      const unsubEmployees = onSnapshot(collection(db, "employees"), (snap) => {
        const list: Employee[] = [];
        snap.forEach((d) => list.push(d.data() as Employee));
        setEmployees(list);
        localStorage.setItem('caf_employees', JSON.stringify(list));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'employees'));

      // 5. Watch Sales
      const unsubSales = onSnapshot(collection(db, "sales"), (snap) => {
        const list: Sale[] = [];
        snap.forEach((d) => list.push(d.data() as Sale));
        list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setSales(list);
        localStorage.setItem('caf_sales', JSON.stringify(list));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'sales'));

      // 6. Watch Expenses
      const unsubExpenses = onSnapshot(collection(db, "expenses"), (snap) => {
        const list: Expense[] = [];
        snap.forEach((d) => list.push(d.data() as Expense));
        list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setExpenses(list);
        localStorage.setItem('caf_expenses', JSON.stringify(list));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'expenses'));

      // 7. Watch Shifts
      const unsubShifts = onSnapshot(collection(db, "shifts"), (snap) => {
        const list: Shift[] = [];
        snap.forEach((d) => list.push(d.data() as Shift));
        list.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
        setShifts(list);
        localStorage.setItem('caf_shifts', JSON.stringify(list));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'shifts'));

      // 8. Watch Customers
      const unsubCustomers = onSnapshot(collection(db, "customers"), (snap) => {
        const map = new Map<string, CustomerDetails>();
        snap.forEach((d) => {
          const cust = d.data() as CustomerDetails;
          const key = (cust.documentId || d.id || '').trim();
          if (key) map.set(key, cust);
        });
        const list = Array.from(map.values());
        setCustomers(list);
        localStorage.setItem('caf_customers', JSON.stringify(list));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'customers'));

      return () => {
        unsubIngredients();
        unsubMenuItems();
        unsubEmployees();
        unsubSales();
        unsubExpenses();
        unsubShifts();
        unsubCustomers();
      };
    });

    return () => {
      unsubBusiness();
    };
  }, []);

  // 5. Sync Helpers (Optimized for Firestore)
  const syncMenu = async (newMenu: MenuItem[]) => {
    setMenuItems(newMenu);
    localStorage.setItem('caf_menu_items', JSON.stringify(newMenu));
  };

  const syncIngredients = async (newIngs: Ingredient[]) => {
    setIngredients(newIngs);
    localStorage.setItem('caf_ingredients', JSON.stringify(newIngs));
  };

  const syncEmployees = async (newEmps: Employee[]) => {
    setEmployees(newEmps);
    localStorage.setItem('caf_employees', JSON.stringify(newEmps));
  };

  const syncSales = async (newSales: Sale[]) => {
    setSales(newSales);
    localStorage.setItem('caf_sales', JSON.stringify(newSales));
  };

  const syncExpenses = async (newExpenses: Expense[]) => {
    setExpenses(newExpenses);
    localStorage.setItem('caf_expenses', JSON.stringify(newExpenses));
  };

  const syncShifts = async (newShifts: Shift[]) => {
    setShifts(newShifts);
    localStorage.setItem('caf_shifts', JSON.stringify(newShifts));
  };

  const handleUpdateBusinessName = async (name: string) => {
    setBusinessName(name);
    localStorage.setItem('caf_business_name', name);
    try {
      await setDoc(doc(db, "config", "business"), { name });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "config/business");
    }
  };

  // 6. Action Handlers

  // Session login
  const handleSelectEmployee = (emp: Employee | null) => {
    setActiveEmployee(emp);
    if (emp) {
      localStorage.setItem('caf_active_employee', JSON.stringify(emp));
      const currentOpenShift = shifts.find(s => s.status === 'open' && s.employeeId === emp.id);
      setActiveShift(currentOpenShift || null);
    } else {
      localStorage.removeItem('caf_active_employee');
      setActiveShift(null);
    }
  };

  // Start shift
  const handleStartShift = async (cashStart: number) => {
    if (!activeEmployee) return;

    const newShift: Shift = {
      id: `shift_${Date.now()}`,
      employeeId: activeEmployee.id,
      employeeName: activeEmployee.name,
      startTime: new Date().toISOString(),
      cashStart,
      status: 'open'
    };

    const updatedShifts = [newShift, ...shifts];
    syncShifts(updatedShifts);
    setActiveShift(newShift);

    try {
      await setDoc(doc(db, "shifts", newShift.id), removeUndefined(newShift));
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `shifts/${newShift.id}`);
    }
  };

  // End shift (calculates discrepancy)
  const handleEndShift = async (cashEndActual: number, transfersActual: number = 0) => {
    if (!activeShift) return;

    const shiftSales = sales.filter(s => 
      s.status === 'completed' && 
      s.employeeId === activeShift.employeeId && 
      new Date(s.timestamp) >= new Date(activeShift.startTime)
    );

    const cashSalesTotal = shiftSales
      .filter(s => s.paymentMethod === 'efectivo')
      .reduce((sum, s) => sum + s.total, 0);

    const transfersSalesTotal = shiftSales
      .filter(s => s.paymentMethod === 'transferencia')
      .reduce((sum, s) => sum + s.total, 0);

    const cashEndExpected = activeShift.cashStart + cashSalesTotal;

    const completedShift: Shift = {
      ...activeShift,
      endTime: new Date().toISOString(),
      cashEndExpected,
      cashEndActual,
      transfersExpected: transfersSalesTotal,
      transfersActual,
      status: 'closed'
    };

    const updatedShifts = shifts.map(s => s.id === activeShift.id ? completedShift : s);
    syncShifts(updatedShifts);
    setActiveShift(null);

    try {
      await setDoc(doc(db, "shifts", completedShift.id), removeUndefined(completedShift));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `shifts/${completedShift.id}`);
    }
  };

  // Register Venta POS
  const handleRegisterSale = (
    saleItems: SaleItem[], 
    paymentMethod: 'efectivo' | 'tarjeta' | 'transferencia',
    cashReceived?: number,
    changeGiven?: number,
    transferNumber?: string,
    customer?: CustomerDetails,
    invoiceNumber?: string,
    discount?: number
  ) => {
    if (!activeEmployee) return;

    const total = saleItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const cost = saleItems.reduce((acc, item) => acc + (item.cost * item.quantity), 0);
    const taxRate = 0.0;
    const finalTotalWithTax = Math.max(0, (total - (discount || 0)) * (1 + taxRate));

    const newSale: Sale = {
      id: `sale_${Date.now()}`,
      invoiceNumber,
      timestamp: new Date().toISOString(),
      items: saleItems,
      total: finalTotalWithTax,
      cost: cost,
      paymentMethod,
      status: 'completed',
      employeeId: activeEmployee.id,
      employeeName: activeEmployee.name,
      cashReceived,
      changeGiven,
      transferNumber,
      customer,
      discount: discount || 0,
      subtotal: total
    };

    const updatedIngredients = [...ingredients];
    const updatedMenuItems = [...menuItems];
    const changedMenuItems = new Set<string>();
    
    const deductMenuItem = (mItem: MenuItem, qty: number) => {
      if (!mItem.ingredients || mItem.ingredients.length === 0) {
        if (mItem.stock !== undefined) {
          const menuIdx = updatedMenuItems.findIndex(m => m.id === mItem.id);
          if (menuIdx > -1) {
            updatedMenuItems[menuIdx] = {
              ...updatedMenuItems[menuIdx],
              stock: Math.max(0, (updatedMenuItems[menuIdx].stock || 0) - qty)
            };
            changedMenuItems.add(mItem.id);
          }
        }
        return;
      }

      if (mItem.category === 'combos') {
        mItem.ingredients.forEach((req) => {
          const component = updatedMenuItems.find(m => m.id === req.ingredientId);
          if (component) {
            deductMenuItem(component, req.quantity * qty);
          }
        });
      } else {
        mItem.ingredients.forEach((req) => {
          const ingredientIdx = updatedIngredients.findIndex(ing => ing.id === req.ingredientId);
          if (ingredientIdx > -1) {
            updatedIngredients[ingredientIdx].stock = Math.max(
              0, 
              updatedIngredients[ingredientIdx].stock - (req.quantity * qty)
            );
          }
        });
      }
    };

    saleItems.forEach((saleItem) => {
      const menuItem = updatedMenuItems.find(m => m.id === saleItem.menuItemId);
      if (menuItem) {
        deductMenuItem(menuItem, saleItem.quantity);
      }
    });

    syncSales([newSale, ...sales]);
    syncIngredients(updatedIngredients);
    if (changedMenuItems.size > 0) {
      syncMenu(updatedMenuItems);
    }

    if (newSale.customer && newSale.customer.documentId.trim() && newSale.customer.documentId.trim() !== '9999999999') {
      const cleanDocId = newSale.customer.documentId.trim();
      const nextCustomers = [newSale.customer, ...customers.filter(c => c.documentId.trim() !== cleanDocId)];
      setCustomers(nextCustomers);
      localStorage.setItem('caf_customers', JSON.stringify(nextCustomers));
    }

    const saveSaleAndDeductStock = async () => {
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, "sales", newSale.id), removeUndefined(newSale));
        
        if (newSale.customer && newSale.customer.documentId.trim() && newSale.customer.documentId.trim() !== '9999999999') {
          batch.set(doc(db, "customers", newSale.customer.documentId.trim()), removeUndefined(newSale.customer));
        }

        updatedIngredients.forEach((ing) => {
          batch.set(doc(db, "ingredients", ing.id), removeUndefined(ing));
        });

        changedMenuItems.forEach((mId) => {
          const m = updatedMenuItems.find(x => x.id === mId);
          if (m) batch.set(doc(db, "menuItems", m.id), removeUndefined(m));
        });

        if (activeShift) {
          const shiftSales = [newSale, ...sales].filter(s => 
            s.status === 'completed' && 
            s.employeeId === activeShift.employeeId && 
            new Date(s.timestamp) >= new Date(activeShift.startTime)
          );
          
          const cashSalesTotal = shiftSales
            .filter(s => s.paymentMethod === 'efectivo')
            .reduce((sum, s) => sum + s.total, 0);

          const transfersSalesTotal = shiftSales
            .filter(s => s.paymentMethod === 'transferencia')
            .reduce((sum, s) => sum + s.total, 0);

          const updatedShift = {
            ...activeShift,
            cashEndExpected: activeShift.cashStart + cashSalesTotal,
            transfersExpected: transfersSalesTotal
          };

          batch.set(doc(db, "shifts", updatedShift.id), removeUndefined(updatedShift));
          setActiveShift(updatedShift);
        }

        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `sales/${newSale.id}`);
      }
    };
    saveSaleAndDeductStock();
  };

  const handleSaveCustomer = async (customer: CustomerDetails) => {
    const cleanDocId = customer.documentId.trim();
    const nextCustomers = [customer, ...customers.filter(c => c.documentId.trim() !== cleanDocId)];
    setCustomers(nextCustomers);
    localStorage.setItem('caf_customers', JSON.stringify(nextCustomers));
    try {
      await setDoc(doc(db, 'customers', cleanDocId), removeUndefined(customer));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `customers/${cleanDocId}`);
    }
  };

  const handleDeleteCustomer = async (documentId: string) => {
    const cleanDocId = documentId.trim();
    const nextCustomers = customers.filter(c => c.documentId.trim() !== cleanDocId);
    setCustomers(nextCustomers);
    localStorage.setItem('caf_customers', JSON.stringify(nextCustomers));
    try {
      await deleteDoc(doc(db, 'customers', cleanDocId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `customers/${cleanDocId}`);
    }
  };

  const handleVoidSale = async (saleId: string) => {
    const saleToVoid = sales.find(s => s.id === saleId);
    if (!saleToVoid || saleToVoid.status === 'voided') return;

    const updatedSales = sales.map(s => {
      if (s.id === saleId) {
        return { ...s, status: 'voided' as const };
      }
      return s;
    });

    const updatedIngredients = [...ingredients];
    const updatedMenuItems = [...menuItems];
    const changedMenuItems = new Set<string>();

    const restoreMenuItem = (mItem: MenuItem, qty: number) => {
      if (!mItem.ingredients || mItem.ingredients.length === 0) {
        if (mItem.stock !== undefined) {
          const menuIdx = updatedMenuItems.findIndex(m => m.id === mItem.id);
          if (menuIdx > -1) {
            updatedMenuItems[menuIdx] = {
              ...updatedMenuItems[menuIdx],
              stock: (updatedMenuItems[menuIdx].stock || 0) + qty
            };
            changedMenuItems.add(mItem.id);
          }
        }
        return;
      }

      if (mItem.category === 'combos') {
        mItem.ingredients.forEach((req) => {
          const component = updatedMenuItems.find(m => m.id === req.ingredientId);
          if (component) {
            restoreMenuItem(component, req.quantity * qty);
          }
        });
      } else {
        mItem.ingredients.forEach((req) => {
          const ingredientIdx = updatedIngredients.findIndex(ing => ing.id === req.ingredientId);
          if (ingredientIdx > -1) {
            updatedIngredients[ingredientIdx].stock = parseFloat(
              (updatedIngredients[ingredientIdx].stock + (req.quantity * qty)).toFixed(4)
            );
          }
        });
      }
    };

    saleToVoid.items.forEach((saleItem) => {
      const menuItem = updatedMenuItems.find(m => m.id === saleItem.menuItemId);
      if (menuItem) {
        restoreMenuItem(menuItem, saleItem.quantity);
      }
    });

    syncSales(updatedSales);
    syncIngredients(updatedIngredients);
    if (changedMenuItems.size > 0) {
      syncMenu(updatedMenuItems);
    }

    try {
      const batch = writeBatch(db);
      
      const updatedSaleDoc = { ...saleToVoid, status: 'voided' as const };
      batch.set(doc(db, "sales", saleId), removeUndefined(updatedSaleDoc));

      updatedIngredients.forEach((ing) => {
        batch.set(doc(db, "ingredients", ing.id), removeUndefined(ing));
      });

      changedMenuItems.forEach((mId) => {
        const m = updatedMenuItems.find(x => x.id === mId);
        if (m) batch.set(doc(db, "menuItems", m.id), removeUndefined(m));
      });

      if (activeShift) {
        const shiftSales = updatedSales.filter(s => 
          s.status === 'completed' && 
          s.employeeId === activeShift.employeeId && 
          new Date(s.timestamp) >= new Date(activeShift.startTime)
        );
        
        const cashSalesTotal = shiftSales
          .filter(s => s.paymentMethod === 'efectivo')
          .reduce((sum, s) => sum + s.total, 0);

        const transfersSalesTotal = shiftSales
          .filter(s => s.paymentMethod === 'transferencia')
          .reduce((sum, s) => sum + s.total, 0);

        const updatedShift = {
          ...activeShift,
          cashEndExpected: activeShift.cashStart + cashSalesTotal,
          transfersExpected: transfersSalesTotal
        };

        batch.set(doc(db, "shifts", updatedShift.id), removeUndefined(updatedShift));
        setActiveShift(updatedShift);
      }

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `sales/${saleId}/void`);
    }
  };

  const handleDeleteSale = async (saleId: string) => {
    const saleToDelete = sales.find(s => s.id === saleId);
    if (!saleToDelete) return;

    const updatedSales = sales.filter(s => s.id !== saleId);

    const updatedIngredients = [...ingredients];
    const updatedMenuItems = [...menuItems];
    const changedMenuItems = new Set<string>();

    if (saleToDelete.status === 'completed') {
      const restoreMenuItem = (mItem: MenuItem, qty: number) => {
        if (!mItem.ingredients || mItem.ingredients.length === 0) {
          if (mItem.stock !== undefined) {
            const menuIdx = updatedMenuItems.findIndex(m => m.id === mItem.id);
            if (menuIdx > -1) {
              updatedMenuItems[menuIdx] = {
                ...updatedMenuItems[menuIdx],
                stock: (updatedMenuItems[menuIdx].stock || 0) + qty
              };
              changedMenuItems.add(mItem.id);
            }
          }
          return;
        }

        if (mItem.category === 'combos') {
          mItem.ingredients.forEach((req) => {
            const component = updatedMenuItems.find(m => m.id === req.ingredientId);
            if (component) {
              restoreMenuItem(component, req.quantity * qty);
            }
          });
        } else {
          mItem.ingredients.forEach((req) => {
            const ingredientIdx = updatedIngredients.findIndex(ing => ing.id === req.ingredientId);
            if (ingredientIdx > -1) {
              updatedIngredients[ingredientIdx].stock = parseFloat(
                (updatedIngredients[ingredientIdx].stock + (req.quantity * qty)).toFixed(4)
              );
            }
          });
        }
      };

      saleToDelete.items.forEach((saleItem) => {
        const menuItem = updatedMenuItems.find(m => m.id === saleItem.menuItemId);
        if (menuItem) {
          restoreMenuItem(menuItem, saleItem.quantity);
        }
      });
    }

    syncSales(updatedSales);
    if (saleToDelete.status === 'completed') {
      syncIngredients(updatedIngredients);
      if (changedMenuItems.size > 0) {
        syncMenu(updatedMenuItems);
      }
    }

    try {
      const batch = writeBatch(db);
      
      batch.delete(doc(db, "sales", saleId));

      if (saleToDelete.status === 'completed') {
        updatedIngredients.forEach((ing) => {
          batch.set(doc(db, "ingredients", ing.id), removeUndefined(ing));
        });
        changedMenuItems.forEach((mId) => {
          const m = updatedMenuItems.find(x => x.id === mId);
          if (m) batch.set(doc(db, "menuItems", m.id), removeUndefined(m));
        });
      }

      if (activeShift) {
        const shiftSales = updatedSales.filter(s => 
          s.status === 'completed' && 
          s.employeeId === activeShift.employeeId && 
          new Date(s.timestamp) >= new Date(activeShift.startTime)
        );
        
        const cashSalesTotal = shiftSales
          .filter(s => s.paymentMethod === 'efectivo')
          .reduce((sum, s) => sum + s.total, 0);

        const transfersSalesTotal = shiftSales
          .filter(s => s.paymentMethod === 'transferencia')
          .reduce((sum, s) => sum + s.total, 0);

        const updatedShift = {
          ...activeShift,
          cashEndExpected: activeShift.cashStart + cashSalesTotal,
          transfersExpected: transfersSalesTotal
        };

        batch.set(doc(db, "shifts", updatedShift.id), removeUndefined(updatedShift));
        setActiveShift(updatedShift);
      }

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `sales/${saleId}`);
    }
  };

  // Inventory restock
  const handleRestockIngredient = async (ingredientId: string, quantity: number, totalCost: number) => {
    const updatedIngs = ingredients.map((ing) => {
      if (ing.id === ingredientId) {
        return { ...ing, stock: ing.stock + quantity };
      }
      return ing;
    });

    const ingredient = ingredients.find(i => i.id === ingredientId);
    const newExpense: Expense = {
      id: `exp_${Date.now()}`,
      timestamp: new Date().toISOString(),
      description: `Compra: Reabasto de ${ingredient?.name || ingredientId} (+${quantity} ${ingredient?.unit})`,
      category: 'insumos',
      amount: totalCost
    };

    syncIngredients(updatedIngs);
    syncExpenses([newExpense, ...expenses]);

    try {
      const batch = writeBatch(db);
      const ingToUpdate = updatedIngs.find(i => i.id === ingredientId);
      if (ingToUpdate) {
        batch.set(doc(db, "ingredients", ingredientId), ingToUpdate);
      }
      batch.set(doc(db, "expenses", newExpense.id), newExpense);
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `ingredients/${ingredientId}`);
    }
  };

  const handleRestockMenuItem = async (menuItemId: string, quantity: number, totalCost: number) => {
    const updatedMenu = menuItems.map((m) => {
      if (m.id === menuItemId && m.stock !== undefined) {
        return { ...m, stock: m.stock + quantity };
      }
      return m;
    });

    const item = menuItems.find(m => m.id === menuItemId);
    const newExpense: Expense = {
      id: `exp_${Date.now()}`,
      timestamp: new Date().toISOString(),
      description: `Compra: Reabasto de ${item?.name || menuItemId} (+${quantity} unidades)`,
      category: 'insumos',
      amount: totalCost
    };

    syncMenu(updatedMenu);
    syncExpenses([newExpense, ...expenses]);

    try {
      const batch = writeBatch(db);
      const itemToUpdate = updatedMenu.find(m => m.id === menuItemId);
      if (itemToUpdate) {
        batch.set(doc(db, "menuItems", menuItemId), removeUndefined(itemToUpdate));
      }
      batch.set(doc(db, "expenses", newExpense.id), newExpense);
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `menuItems/${menuItemId}`);
    }
  };

  // Add custom raw material
  const handleAddIngredient = async (newIng: Omit<Ingredient, 'id'>) => {
    const id = `ing_custom_${Date.now()}`;
    const entry: Ingredient = { ...newIng, id };
    syncIngredients([...ingredients, entry]);

    try {
      await setDoc(doc(db, "ingredients", id), entry);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `ingredients/${id}`);
    }
  };

  // Update ingredient minimum stock safety limits
  const handleUpdateMinStock = async (ingredientId: string, minStock: number) => {
    const updated = ingredients.map(ing => ing.id === ingredientId ? { ...ing, minStock } : ing);
    syncIngredients(updated);

    const ingToUpdate = updated.find(i => i.id === ingredientId);
    if (ingToUpdate) {
      try {
        await setDoc(doc(db, "ingredients", ingredientId), ingToUpdate);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `ingredients/${ingredientId}`);
      }
    }
  };

  // Delete raw material
  const handleDeleteIngredient = async (ingredientId: string) => {
    const updated = ingredients.filter(ing => ing.id !== ingredientId);
    syncIngredients(updated);

    try {
      await deleteDoc(doc(db, "ingredients", ingredientId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `ingredients/${ingredientId}`);
    }
  };

  // Edit raw material details
  const handleEditIngredient = async (updatedIng: Ingredient) => {
    const updated = ingredients.map(ing => ing.id === updatedIng.id ? updatedIng : ing);
    syncIngredients(updated);

    try {
      await setDoc(doc(db, "ingredients", updatedIng.id), updatedIng);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `ingredients/${updatedIng.id}`);
    }
  };

  // Manual operational expenses logging
  const handleAddExpense = async (newExp: Omit<Expense, 'id' | 'timestamp'>) => {
    const entry: Expense = {
      ...newExp,
      id: `exp_manual_${Date.now()}`,
      timestamp: new Date().toISOString()
    };
    syncExpenses([entry, ...expenses]);

    try {
      await setDoc(doc(db, "expenses", entry.id), entry);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `expenses/${entry.id}`);
    }
  };

  const handleRemoveExpense = async (expenseId: string) => {
    syncExpenses(expenses.filter(e => e.id !== expenseId));

    try {
      await deleteDoc(doc(db, "expenses", expenseId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `expenses/${expenseId}`);
    }
  };

  // Staff registry
  const handleAddEmployee = async (newEmp: Omit<Employee, 'id'>) => {
    const entry: Employee = {
      ...newEmp,
      id: `emp_custom_${Date.now()}`
    };
    syncEmployees([...employees, entry]);

    try {
      await setDoc(doc(db, "employees", entry.id), entry);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `employees/${entry.id}`);
    }
  };

  const handleToggleEmployeeStatus = async (id: string) => {
    const updated = employees.map(emp => {
      if (emp.id === id) {
        return { ...emp, status: emp.status === 'active' ? ('inactive' as const) : ('active' as const) };
      }
      return emp;
    });
    syncEmployees(updated);

    const empToUpdate = updated.find(e => e.id === id);
    if (empToUpdate) {
      if (empToUpdate.status === 'inactive' && activeEmployee?.id === id) {
        const fallbackAdmin = updated.find(e => e.status === 'active') || updated[0];
        if (fallbackAdmin) {
          setActiveEmployee(fallbackAdmin);
          localStorage.setItem('caf_active_employee', JSON.stringify(fallbackAdmin));
        }
      }

      try {
        await setDoc(doc(db, "employees", id), empToUpdate);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `employees/${id}`);
      }
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    if (id === 'emp_1') {
      alert("No se puede eliminar el perfil del Administrador Principal.");
      return;
    }

    const isWorkingInShift = shifts.some(s => s.status === 'open' && s.employeeId === id);
    if (isWorkingInShift) {
      alert("No se puede eliminar a un colaborador con un turno de caja abierto actualmente. Cierre su turno primero.");
      return;
    }

    const updated = employees.filter(emp => emp.id !== id);
    syncEmployees(updated);

    try {
      await deleteDoc(doc(db, "employees", id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `employees/${id}`);
    }
  };

  // Menu customization
  const handleAddMenuItem = async (newItem: Omit<MenuItem, 'id'>) => {
    const entry: MenuItem = {
      ...newItem,
      id: `prod_custom_${Date.now()}`
    };
    syncMenu([...menuItems, entry]);

    try {
      await setDoc(doc(db, "menuItems", entry.id), removeUndefined(entry));
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `menuItems/${entry.id}`);
    }
  };

  const handleToggleMenuItemStatus = async (id: string) => {
    const updated = menuItems.map(item => {
      if (item.id === id) {
        return { ...item, status: item.status === 'active' ? ('inactive' as const) : ('active' as const) };
      }
      return item;
    });
    syncMenu(updated);

    const itemToUpdate = updated.find(i => i.id === id);
    if (itemToUpdate) {
      try {
        await setDoc(doc(db, "menuItems", id), removeUndefined(itemToUpdate));
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `menuItems/${id}`);
      }
    }
  };

  const handleUpdateMenuItemPrice = async (id: string, price: number) => {
    const updated = menuItems.map(item => item.id === id ? { ...item, price } : item);
    syncMenu(updated);

    const itemToUpdate = updated.find(i => i.id === id);
    if (itemToUpdate) {
      try {
        await setDoc(doc(db, "menuItems", id), removeUndefined(itemToUpdate));
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `menuItems/${id}`);
      }
    }
  };

  const handleDeleteMenuItem = async (id: string) => {
    const updated = menuItems.filter(item => item.id !== id);
    syncMenu(updated);

    try {
      await deleteDoc(doc(db, "menuItems", id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `menuItems/${id}`);
    }
  };

  const handleEditMenuItem = async (updatedItem: MenuItem) => {
    const updated = menuItems.map(item => item.id === updatedItem.id ? updatedItem : item);
    syncMenu(updated);

    try {
      await setDoc(doc(db, "menuItems", updatedItem.id), removeUndefined(updatedItem));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `menuItems/${updatedItem.id}`);
    }
  };

  const handleClearHistory = async () => {
    try {
      const batch = writeBatch(db);
      sales.forEach((s) => {
        batch.delete(doc(db, "sales", s.id));
      });
      expenses.forEach((e) => {
        batch.delete(doc(db, "expenses", e.id));
      });
      shifts.forEach((sh) => {
        batch.delete(doc(db, "shifts", sh.id));
      });

      batch.set(doc(db, "config", "system"), { id: "system", seeded: true }, { merge: true });
      await batch.commit();

      setSales([]);
      setExpenses([]);
      setShifts([]);
      setActiveShift(null);

      localStorage.setItem('caf_sales', JSON.stringify([]));
      localStorage.setItem('caf_expenses', JSON.stringify([]));
      localStorage.setItem('caf_shifts', JSON.stringify([]));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'clear_history');
    }
  };

  const handleWipeEverything = async () => {
    try {
      const batch = writeBatch(db);

      sales.forEach((s) => {
        batch.delete(doc(db, "sales", s.id));
      });
      expenses.forEach((e) => {
        batch.delete(doc(db, "expenses", e.id));
      });
      shifts.forEach((sh) => {
        batch.delete(doc(db, "shifts", sh.id));
      });
      ingredients.forEach((ing) => {
        batch.delete(doc(db, "ingredients", ing.id));
      });
      menuItems.forEach((item) => {
        batch.delete(doc(db, "menuItems", item.id));
      });
      employees.forEach((emp) => {
        if (emp.id !== 'emp_1') {
          batch.delete(doc(db, "employees", emp.id));
        }
      });

      const defaultAdmin = { 
        id: 'emp_1', 
        name: 'GUERRERO CARDENAS ALEJANDRA ESTEFANIA', 
        role: 'Administrador' as const, 
        status: 'active' as const, 
        pin: '1234' 
      };
      batch.set(doc(db, "employees", defaultAdmin.id), defaultAdmin);
      batch.set(doc(db, "config", "system"), { seeded: true });
      setSales([]);
      setExpenses([]);
      setShifts([]);
      setIngredients([]);
      setMenuItems([]);
      setEmployees([defaultAdmin]);
      setActiveShift(null);
      setActiveEmployee(defaultAdmin);

      localStorage.setItem('caf_sales', JSON.stringify([]));
      localStorage.setItem('caf_expenses', JSON.stringify([]));
      localStorage.setItem('caf_shifts', JSON.stringify([]));
      localStorage.setItem('caf_ingredients', JSON.stringify([]));
      localStorage.setItem('caf_menu_items', JSON.stringify([]));
      localStorage.setItem('caf_employees', JSON.stringify([defaultAdmin]));
      localStorage.setItem('caf_active_employee', JSON.stringify(defaultAdmin));

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'wipe_everything');
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans text-black selection:bg-yellow-300 selection:text-black" id="main-layout">
      {/* Top Combined Sticky Header & Navigation */}
      <div className="sticky top-0 z-40 w-full shadow-[0_4px_0px_0px_rgba(0,0,0,1)]">
        {/* 1. Dynamic Header controls */}
        <Header 
          businessName={businessName}
          employees={employees}
          activeEmployee={activeEmployee}
          activeShift={activeShift}
          shiftsHistory={shifts}
          onSelectEmployee={handleSelectEmployee}
          onStartShift={handleStartShift}
          onEndShift={handleEndShift}
        />

        {/* 2. Visual Navigation Tabs */}
        <nav className="bg-yellow-300 border-b-4 border-black px-6 py-3" id="sub-navigation">
          <div className="max-w-7xl mx-auto flex gap-3 overflow-x-auto scrollbar-none py-1">
            {[
              { id: 'pos', name: '🎰 PUNTO DE VENTA', icon: Receipt },
              { id: 'ventas', name: '🧾 REGISTRO DE VENTAS', icon: Receipt },
              { id: 'inventario', name: '📦 INVENTARIO', icon: Package },
              { id: 'analiticas', name: '📈 LEDGER & REPORTES', icon: TrendingUp },
              { id: 'personal', name: '👥 PERSONAL & ARQUEOS', icon: Users },
              { id: 'clientes', name: '👤 CLIENTES', icon: Users },
            ].map((tab) => {
              const isSelected = activeTab === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 py-2.5 px-4 border-3 border-black rounded-lg text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                    isSelected 
                      ? 'bg-pink-400 text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] translate-x-[-2px] translate-y-[-2px]' 
                      : 'bg-white text-black hover:bg-zinc-100 hover:translate-x-[-1px] hover:translate-y-[-1px] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]'
                  }`}
                >
                  <span>{tab.name}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {/* 3. Main Work View Panels */}
      <main className="flex-1 px-6 py-8 max-w-7xl w-full mx-auto" id="app-workspace">
        {activeTab === 'pos' && (
          <POSView 
            businessName={businessName}
            menuItems={menuItems}
            ingredients={ingredients}
            activeShift={activeShift}
            activeEmployee={activeEmployee}
            shiftsHistory={shifts}
            sales={sales}
            customers={customers}
            onRegisterSale={handleRegisterSale}
            onSaveCustomer={handleSaveCustomer}
          />
        )}

        {activeTab === 'inventario' && (
          <InventoryView 
            ingredients={ingredients}
            menuItems={menuItems}
            onRestockIngredient={handleRestockIngredient}
            onAddIngredient={handleAddIngredient}
            onUpdateMinStock={handleUpdateMinStock}
            onDeleteIngredient={handleDeleteIngredient}
            onEditIngredient={handleEditIngredient}
            onRestockMenuItem={handleRestockMenuItem}
            onAddMenuItem={handleAddMenuItem}
            onEditMenuItem={handleEditMenuItem}
            onDeleteMenuItem={handleDeleteMenuItem}
          />
        )}

        {activeTab === 'analiticas' && (
          <AnalyticsView 
            sales={sales}
            expenses={expenses}
            shifts={shifts}
            onAddExpense={handleAddExpense}
            onRemoveExpense={handleRemoveExpense}
          />
        )}

        {activeTab === 'personal' && (
          <StaffView 
            employees={employees}
            shiftsHistory={shifts}
            activeEmployee={activeEmployee}
            activeShift={activeShift}
            onAddEmployee={handleAddEmployee}
            onToggleEmployeeStatus={handleToggleEmployeeStatus}
            onDeleteEmployee={handleDeleteEmployee}
            sales={sales}
            expenses={expenses}
          />
        )}

        {activeTab === 'ventas' && (
          <SalesView 
            sales={sales}
            menuItems={menuItems}
            ingredients={ingredients}
            employees={employees}
            onVoidSale={handleVoidSale}
            onDeleteSale={handleDeleteSale}
          />
        )}

        {activeTab === 'clientes' && (
          <CustomersView
            customers={customers}
            sales={sales}
            onSaveCustomer={handleSaveCustomer}
            onDeleteCustomer={handleDeleteCustomer}
          />
        )}
      </main>

      {/* 4. Elegant Retro Status Footer */}
      <footer className="bg-black text-lime-400 border-t-4 border-black py-4 px-6 text-center text-xs font-retro-mono tracking-wider shadow-[0_-4px_0px_0px_rgba(0,0,0,1)]" id="app-footer">
        <p className="font-retro-heavy text-yellow-300 text-sm mb-1 uppercase tracking-widest">⚡️ {businessName} SYSTEM ONLINE ⚡️</p>
        <p>COSMIC CAFE POS TERMINAL • MODEL 1995 • ALL RIGHTS RESERVED • INSERT COIN TO PLAY</p>
        <div className="flex flex-col items-center justify-center mt-3 gap-2">
          <button 
            onClick={() => {
              if (window.confirm('⚠️ ¿Estás seguro de BORRAR TODO EL SISTEMA? Esto eliminará tus ventas, empleados, insumos y TODOS TUS PRODUCTOS. Quedará como nuevo de fábrica. Esta acción NO se puede deshacer.')) {
                handleWipeEverything();
              }
            }}
            className="px-3 py-1 bg-red-600 text-white font-black text-[9px] uppercase rounded-md hover:bg-red-500 border border-red-800 transition-colors"
          >
            🗑️ Limpiar Datos de Prueba
          </button>
          <p className="text-zinc-400 text-[10px] uppercase font-black tracking-widest">
            Desarrollado por <span className="text-pink-400">Palma Nexus Solutions</span> - <span className="text-cyan-400">099 821 2307</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
