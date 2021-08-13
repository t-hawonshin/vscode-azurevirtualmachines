Name: {{name}}
Version: 1.0
Release: 1%{?dist}
Summary: Hello World example implemented in C

License: MIT
Vendor: Microsoft Corporation
Distribution: Mariner
URL: https://www.example.com/%{name}
Source0: https://www.example.com/%{name}/releases/%{name}-%{version}.tar.gz

BuildRequires: gcc
BuildRequires: make

%define  debug_package %{nil}

%description
The long-tail description for our Hello World Example implemented in C.

%prep
%setup -q

%build
make %{?_smp_mflags}

%install
%make_install

%files
%{_bindir}/%{name}

%changelog
* {{date}} {{username}} <{{email}}> - 1.0-1
  - Initial set up
