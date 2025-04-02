const validateRegister = (data) => {
    const { name, email, password } = data;
    if (!name || !email || !password) {
        return 'All fields are required';
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
        return 'Invalid email format';
    }
    if (password.length < 6) {
        return 'Password must be at least 6 characters';
    }
    return null;
};

module.exports = { validateRegister };