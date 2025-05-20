import { useState, useEffect } from "react";
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { useNavigate } from "react-router-dom";
import "./Todo.css";

const CATEGORY_COLORS = {
  Work: "#f48fb1",
  Personal: "#ce93d8",
  Shopping: "#81d4fa",
  Other: "#a5d6a7",
};

const Todo = () => {
  const [todos, setTodos] = useState([]);
  const [newTodo, setNewTodo] = useState("");
  const [newCategory, setNewCategory] = useState("Work");
  const [newDueDate, setNewDueDate] = useState("");
  const [username, setUsername] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTodo, setEditTodo] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        setUsername(user.displayName || "User");

        const q = query(
          collection(db, "todos"),
          where("userId", "==", user.uid),
          orderBy("category"),
          orderBy("dueDate", "asc")
        );

        const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
          setTodos(
            snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
              dueDate: doc.data().dueDate ? doc.data().dueDate.toDate() : null,
            }))
          );
        });

        return () => unsubscribeSnapshot();
      } else {
        navigate("/login");
      }
    });

    return () => unsubscribeAuth();
  }, [navigate]);

  useEffect(() => {
    if (filterCategory !== "All") {
      setNewCategory(filterCategory);
    }
  }, [filterCategory]);

  // Optimistic Add Todo:
  const handleAddTodo = async (e) => {
    e.preventDefault();
    const textToAdd = newTodo.trim();
    if (auth.currentUser && textToAdd) {
      const tempId = `temp-${Date.now()}`;
      const tempTodo = {
        id: tempId,
        text: textToAdd,
        userId: auth.currentUser.uid,
        createdAt: new Date(),
        completed: false,
        category: newCategory,
        dueDate: newDueDate ? new Date(newDueDate) : null,
      };

      setTodos((prev) => [tempTodo, ...prev]);

      try {
        await addDoc(collection(db, "todos"), {
          text: textToAdd,
          userId: auth.currentUser.uid,
          createdAt: serverTimestamp(),
          completed: false,
          category: newCategory,
          dueDate: newDueDate ? new Date(newDueDate) : null,
        });
      } catch (error) {
        setTodos((prev) => prev.filter((todo) => todo.id !== tempId));
        console.error("Failed to add todo:", error);
      }

      setNewTodo("");
      setNewDueDate("");
      setNewCategory(filterCategory !== "All" ? filterCategory : "Work");
    }
  };

  const toggleCompleted = async (todo) => {
    if (!todo.id) return;

    setTodos((prevTodos) =>
      prevTodos.map((t) =>
        t.id === todo.id ? { ...t, completed: !t.completed } : t
      )
    );

    const todoRef = doc(db, "todos", todo.id);
    try {
      await updateDoc(todoRef, { completed: !todo.completed });
    } catch (error) {
      setTodos((prevTodos) =>
        prevTodos.map((t) =>
          t.id === todo.id ? { ...t, completed: todo.completed } : t
        )
      );
      console.error("Failed to toggle todo completion:", error);
    }
  };

  const handleDeleteTodo = async (id) => {
    const todoToDelete = todos.find((t) => t.id === id);
    setTodos((prevTodos) => prevTodos.filter((todo) => todo.id !== id));

    const todoRef = doc(db, "todos", id);
    try {
      await deleteDoc(todoRef);
    } catch (error) {
      setTodos((prevTodos) => [...prevTodos, todoToDelete]);
      console.error("Failed to delete todo:", error);
    }
  };

  const openEditModal = (todo) => {
    setEditTodo({
      ...todo,
      dueDate: todo.dueDate ? todo.dueDate.toISOString().slice(0, 10) : "",
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditTodo(null);
  };

  const handleUpdateTodo = async (e) => {
    e.preventDefault();
    if (!editTodo) return;

    const todoRef = doc(db, "todos", editTodo.id);
    try {
      await updateDoc(todoRef, {
        text: editTodo.text.trim(),
        category: editTodo.category,
        dueDate: editTodo.dueDate ? new Date(editTodo.dueDate) : null,
      });

      // Update local todos state immediately
      setTodos((prevTodos) =>
        prevTodos.map((todo) =>
          todo.id === editTodo.id
            ? {
                ...todo,
                text: editTodo.text.trim(),
                category: editTodo.category,
                dueDate: editTodo.dueDate ? new Date(editTodo.dueDate) : null,
              }
            : todo
        )
      );

      closeModal();
    } catch (error) {
      console.error("Failed to update todo:", error);
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
    navigate("/login");
  };

  const filteredTodos =
    filterCategory === "All"
      ? todos
      : todos.filter((todo) => todo.category === filterCategory);

  const groupedTodos = filteredTodos.reduce((groups, todo) => {
    const cat = todo.category || "Other";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(todo);
    return groups;
  }, {});

  return (
    <div className="todo-page">
      <h1>
        WELCOME TO YOUR DAILY TO-DO PAGE
        <br />
        {username.toUpperCase()}
      </h1>

      <div className="logout-section">
        <button className="logout-button" onClick={handleLogout}>
          Logout
        </button>
      </div>

      {/* Category Filter Tabs */}
      <div style={{ textAlign: "center", marginBottom: "1rem" }}>
        {["All", "Work", "Personal", "Shopping", "Other"].map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            style={{
              margin: "0 0.3rem",
              padding: "0.4rem 1rem",
              borderRadius: "12px",
              border: "none",
              cursor: "pointer",
              backgroundColor:
                filterCategory === cat
                  ? CATEGORY_COLORS[cat] || "#b0bec5"
                  : "#eee",
              color: filterCategory === cat ? "#fff" : "#333",
              fontWeight: "bold",
              transition: "background-color 0.3s ease",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Add Todo Form */}
      <div className="todo-container">
        <h2 className="todo-heading">
          Add New To-Do {filterCategory !== "All" && `(${filterCategory})`}
        </h2>
        <form onSubmit={handleAddTodo} className="todo-form">
          <input
            type="text"
            placeholder="What're your plans today?"
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            required
          />
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              required
              style={{
                flex: 1,
                padding: "0.6rem",
                borderRadius: "10px",
                border: "1px solid #ccc",
              }}
            >
              {Object.keys(CATEGORY_COLORS).map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              style={{
                padding: "0.6rem",
                borderRadius: "10px",
                border: "1px solid #ccc",
                flex: 1,
              }}
            />
          </div>
          <button type="submit">Add Todo</button>
        </form>

        {Object.keys(groupedTodos).length === 0 && (
          <p style={{ textAlign: "center" }}>
            No todos found for this category.
          </p>
        )}

        {Object.entries(groupedTodos).map(([category, todosInCategory]) => (
          <div key={category} style={{ marginBottom: "2rem" }}>
            <h3
              style={{
                color: CATEGORY_COLORS[category] || "#333",
                marginBottom: "0.5rem",
              }}
            >
              {category}
            </h3>
            <ul className="todo-list">
              {todosInCategory
                .sort((a, b) => {
                  if (!a.dueDate) return 1;
                  if (!b.dueDate) return -1;
                  return a.dueDate - b.dueDate;
                })
                .map((todo) => (
                  <li
                    key={todo.id}
                    className={`todo-item ${todo.completed ? "completed" : ""}`}
                    style={{
                      borderLeft: `6px solid ${
                        CATEGORY_COLORS[todo.category] || "#999"
                      }`,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={todo.completed || false}
                      onChange={() => toggleCompleted(todo)}
                    />
                    <span>{todo.text}</span>

                    {todo.dueDate && (
                      <span className="due-date">
                        Due: {todo.dueDate.toLocaleDateString()}
                      </span>
                    )}

                    <div className="todo-item-buttons">
                      <button
                        className="edit-button"
                        onClick={() => openEditModal(todo)}
                      >
                        Edit
                      </button>
                      <button onClick={() => handleDeleteTodo(todo.id)}>
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      {modalOpen && editTodo && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Edit To-Do</h2>
            <form onSubmit={handleUpdateTodo} className="modal-form">
              <input
                type="text"
                value={editTodo.text}
                onChange={(e) =>
                  setEditTodo((prev) => ({ ...prev, text: e.target.value }))
                }
                required
              />
              <select
                value={editTodo.category}
                onChange={(e) =>
                  setEditTodo((prev) => ({ ...prev, category: e.target.value }))
                }
                required
              >
                {Object.keys(CATEGORY_COLORS).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={editTodo.dueDate || ""}
                onChange={(e) =>
                  setEditTodo((prev) => ({ ...prev, dueDate: e.target.value }))
                }
              />
              <div className="modal-buttons">
                <button type="submit">Save</button>
                <button type="button" onClick={closeModal}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Todo;
