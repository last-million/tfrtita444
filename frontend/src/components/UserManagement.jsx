import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    email: '',
    isAdmin: false
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuth();
  
  // Only the user "hamza" should be able to access this
  const isHamza = user?.username === 'hamza';

  // Fetch users on component mount
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        // In a real app, this would fetch from a real endpoint
        // Mock data for demonstration
        setUsers([
          { id: 1, username: 'hamza', email: 'hamza@example.com', isAdmin: true },
          { id: 2, username: 'user1', email: 'user1@example.com', isAdmin: false },
        ]);
      } catch (err) {
        setError('Failed to fetch users');
        console.error(err);
      }
    };

    fetchUsers();
  }, []);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setNewUser({
      ...newUser,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    
    // Only "hamza" can create users
    if (!isHamza) {
      setError('Only the administrator "hamza" can create users');
      return;
    }
    
    try {
      // In a real app, this would be an API call
      // Simulate successful creation
      const newId = users.length + 1;
      const createdUser = {
        id: newId,
        username: newUser.username,
        email: newUser.email,
        isAdmin: newUser.isAdmin
      };
      
      // Add new user to list and clear form
      setUsers([...users, createdUser]);
      setNewUser({
        username: '',
        password: '',
        email: '',
        isAdmin: false
      });
      setShowAddForm(false);
      setError('');
    } catch (err) {
      setError('Failed to create user');
      console.error(err);
    }
  };

  const handleDeleteUser = async (userId) => {
    // Only "hamza" can delete users
    if (!isHamza) {
      setError('Only the administrator "hamza" can delete users');
      return;
    }
    
    try {
      // In a real app, this would be an API call
      // Remove deleted user from list
      setUsers(users.filter(user => user.id !== userId));
    } catch (err) {
      setError('Failed to delete user');
      console.error(err);
    }
  };

  if (!isHamza) {
    return (
      <div className="access-denied p-4 bg-red-100 text-red-800 rounded">
        <h2 className="text-xl font-bold mb-2">Access Denied</h2>
        <p>Only the administrator "hamza" can access the user management system.</p>
      </div>
    );
  }

  return (
    <div className="user-management p-4 bg-gray-800 rounded-lg shadow">
      <h2 className="text-2xl font-bold text-white mb-4">User Management</h2>
      
      {error && (
        <div className="error-message bg-red-500 text-white p-3 rounded mb-4">
          {error}
        </div>
      )}
      
      {/* Add user button - only visible to hamza */}
      {isHamza && (
        <button 
          className="add-user-button bg-blue-600 text-white px-4 py-2 rounded mb-4 hover:bg-blue-700"
          onClick={() => setShowAddForm(true)}
        >
          Add New User
        </button>
      )}
      
      {/* User creation form */}
      {showAddForm && isHamza && (
        <div className="user-form bg-gray-700 p-4 rounded-lg mb-6">
          <h3 className="text-xl font-bold text-white mb-4">Create New User</h3>
          <form onSubmit={handleAddUser} className="space-y-4">
            <div className="form-group">
              <label htmlFor="username" className="block text-white mb-2">Username</label>
              <input
                type="text"
                id="username"
                name="username"
                value={newUser.username}
                onChange={handleInputChange}
                required
                className="w-full p-2 rounded bg-gray-600 text-white border border-gray-500"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="password" className="block text-white mb-2">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                value={newUser.password}
                onChange={handleInputChange}
                required
                className="w-full p-2 rounded bg-gray-600 text-white border border-gray-500"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="email" className="block text-white mb-2">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                value={newUser.email}
                onChange={handleInputChange}
                required
                className="w-full p-2 rounded bg-gray-600 text-white border border-gray-500"
              />
            </div>
            
            <div className="form-group flex items-center space-x-2">
              <input
                type="checkbox"
                id="isAdmin"
                name="isAdmin"
                checked={newUser.isAdmin}
                onChange={handleInputChange}
                className="rounded bg-gray-600 border-gray-500"
              />
              <label htmlFor="isAdmin" className="text-white">Admin Privileges</label>
            </div>
            
            <div className="button-group flex space-x-2">
              <button 
                type="submit" 
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >
                Create User
              </button>
              <button 
                type="button" 
                className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-500"
                onClick={() => setShowAddForm(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      
      {/* Users list */}
      <div className="users-list overflow-x-auto">
        <table className="min-w-full bg-gray-700 rounded-lg overflow-hidden">
          <thead className="bg-gray-900">
            <tr>
              <th className="px-4 py-2 text-left text-white">Username</th>
              <th className="px-4 py-2 text-left text-white">Email</th>
              <th className="px-4 py-2 text-left text-white">Role</th>
              <th className="px-4 py-2 text-left text-white">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-600">
            {users.map(user => (
              <tr key={user.id} className="bg-gray-800 hover:bg-gray-700">
                <td className="px-4 py-3 text-white">{user.username}</td>
                <td className="px-4 py-3 text-white">{user.email}</td>
                <td className="px-4 py-3 text-white">{user.isAdmin ? 'Administrator' : 'User'}</td>
                <td className="px-4 py-3">
                  {/* Don't allow deleting hamza account */}
                  {user.username !== 'hamza' && (
                    <button 
                      className="delete-button bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
                      onClick={() => handleDeleteUser(user.id)}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UserManagement;
